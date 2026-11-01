# State Tides 相似度匹配与检索 / Similarity Matching and Retrieval

## 中文

### 结论

当前 State Tides **不使用向量嵌入（embeddings）**。项目中没有 `sentence-transformers`、embedding API、向量数据库、近似最近邻（ANN）索引或余弦相似度。检索完全在本地完成，数据来自 JSON 文件，核心方法是经过归一化的关键词集合重叠，并对 emoji 重叠加权。

系统里有两种相关但不同的匹配：

1. **历史日记检索**：从 `data/journal-entries.json` 找出与当前输入相似的历史记录。
2. **状态节点匹配**：把当前输入与 `data/state-nodes.json` 中已知状态的 `label + tags` 比较，以判断它是已有状态的复现，还是应创建新状态。

Anthropic 模型（配置 API key 时）只负责把输入整理成结构化状态字段。常规路径中的相似度计算仍由本地 TypeScript 代码完成，不由模型或向量服务完成。

### 1. 历史日记检索

入口为 `lib/matching.ts` 的 `findSimilarEntries()`，由 `lib/state-tides-service.ts` 中的 `find_similar_entries()` 和 `retrieve_timeline()` 封装。前端在 `app/page.tsx` 中直接导入本地日记 JSON，并通过 React `useMemo` 调用这两个函数。

处理流程：

1. `tokenize()` 将文本按空白切分，转为小写，删除非 ASCII 字母数字字符。
2. 删除长度不超过 2 的 token 和内置停用词；再用 `Set` 去重。
3. `extractEmoji()` 提取查询里的唯一 emoji；历史记录的 emoji 来自 `markers` 字段。
4. 对每条历史记录计算词语交集、emoji 交集和两侧所有词语/emoji 的并集。
5. 没有任何交集的记录被过滤掉；其余记录按分数降序、日期降序排序，返回前 3 条。
6. 所有有交集的记录另按日期升序组成 `relatedTimeline`，并计算相邻出现之间以及最后一次出现之后的空档天数。

分数公式为：

```text
score = (word_overlap_count + 1.5 × emoji_overlap_count) / union_size
```

其中 `union_size` 是查询词、记录词、查询 emoji 和记录 emoji 合并后的唯一元素数。它是一个**自定义的、带 emoji 权重的 Jaccard-like 集合重叠分数**，并非标准 Jaccard，也不是余弦相似度。由于 emoji 在分子中乘以 1.5、在并集中仍只计 1，纯 emoji 查询的分数理论上可能超过 1；当前代码没有把分数截断到 `[0, 1]`。

复杂度方面，每次查询会线性扫描全部日记。若有 `N` 条记录、每条记录平均产生 `T` 个唯一 token，时间复杂度可近似看作 `O(N × T)`；项目没有预计算索引或缓存向量。

### 2. 已知状态节点匹配

入口为 `lib/state-classification.ts` 的 `scoreStateNode()`。系统先通过 `buildScoringQuery()` 合并：

- 原始输入；
- situation；
- automatic thought；
- behavior；
- emotion labels。

随后对每个状态节点只取 `label + tags` 作为该状态的“身份 token”，并计算：

```text
state_score = matched_identity_tokens / all_identity_tokens
```

这衡量“一个已知状态的身份词有多少出现在当前输入中”。它不是对称指标，也不是 Jaccard：分母只使用状态节点一侧的唯一身份 token 数。分数保留三位小数，然后按分数降序排列。

最高分低于 `NOVELTY_THRESHOLD = 0.38`、输入至少有两个有效 token，且没有显式覆盖判断时，系统把输入视为新状态。新状态会写回 `data/state-nodes.json`；已存在的相同 ID 或标签会被复用，避免重复节点。

`phrasesAreNearDuplicates()` 另有一个局部去重规则：它进行简单词尾归一化后计算标准 token Jaccard，阈值为 `0.75`。该函数用于防止结构化字段（如 behavior 与 situation）近似重复，不承担历史检索。

### 3. LLM、存储与“语义”边界

当 `ANTHROPIC_API_KEY` 存在时，`app/api/classify-state/route.ts` 调用 Anthropic Messages API，提取 situation、automatic thought、emotion labels、intensity 和 behavior。API 不可用时使用本地启发式分类。无论哪条常规分类路径，状态节点分数都在服务端用上述 token 重叠算法计算。

`build_relatedness_graph()` 中的 `semanticSeeds` 只是将已经得到的 emotion、tag 和 state match 转为可视化节点；它不生成 embedding，也不执行图数据库检索。

当前存储如下：

- 历史日记：静态 `data/journal-entries.json`，在客户端读取并扫描。
- 状态节点：`data/state-nodes.json`，在服务端读取；新状态可能写回此文件。
- 向量存储：无。
- 关系型/文档数据库：无。

### 4. 适用范围与限制

当前实现依赖精确的英语 token 重叠，因此简单、可解释、无需额外服务，适合小型演示数据集。主要限制是：

- 无法识别没有共同词面的同义表达，例如 “exhausted” 与 “drained”。
- `normalizeToken()` 只保留 `[a-z0-9]`，中文等非 ASCII 文本不会产生有效文字 token；只有 emoji 仍可参与匹配。
- 停用词和词形处理均为手写规则，语言覆盖有限。
- 每次查询全量扫描，数据增长后延迟会线性增加。
- 日记分数是自定义加权公式，不应直接解释为概率。

如果未来需要跨语言、同义改写或大规模数据检索，可以再引入 embedding 模型、向量索引和余弦相似度；这会是架构升级，而不是当前实现的描述。应同时保留现有 token/emoji 特征作为可解释信号，并用真实数据离线评估混合排序效果。

### 5. 关键文件

- `lib/matching.ts`：历史日记 token/emoji 匹配、Top 3 和时间空档。
- `lib/state-tides-service.ts`：检索接口与关系图数据组装。
- `lib/state-classification.ts`：结构化状态推断、状态节点打分与新颖性阈值。
- `lib/state-node-store.ts`：状态节点 JSON 读写。
- `app/api/classify-state/route.ts`：Anthropic/本地 fallback 分类流程。
- `app/page.tsx`：客户端检索调用与结果展示。
- `tests/matching.test.ts`：token、emoji、匹配、时间线和状态复现测试。

---

## English

### Summary

State Tides currently **does not use vector embeddings**. There is no `sentence-transformers` dependency, embedding API, vector database, approximate-nearest-neighbor index, or cosine similarity. Retrieval is local and JSON-backed. Its core signal is normalized keyword-set overlap, with extra weight for overlapping emoji.

The system contains two related but separate matching paths:

1. **Historical journal retrieval** finds past entries related to the current input in `data/journal-entries.json`.
2. **Known-state matching** compares the current input with the `label + tags` of nodes in `data/state-nodes.json` to decide whether the state is recurring or novel.

When configured, the Anthropic model structures the note into state fields. In the normal flow, the similarity scores are still computed by local TypeScript code, not by the model or a vector service.

### 1. Historical journal retrieval

The implementation starts at `findSimilarEntries()` in `lib/matching.ts`. `find_similar_entries()` and `retrieve_timeline()` in `lib/state-tides-service.ts` expose it to the UI. `app/page.tsx` imports the local journal JSON directly and invokes both functions through React `useMemo`.

The pipeline is:

1. `tokenize()` splits on whitespace, lowercases tokens, and removes non-ASCII alphanumeric characters.
2. Tokens of two characters or fewer and built-in stop words are removed; a `Set` deduplicates the remainder.
3. `extractEmoji()` extracts unique emoji from the query. Entry emoji come from each record's `markers` field.
4. Each entry is scored from its word overlap, emoji overlap, and the union of all words and emoji on both sides.
5. Entries with no overlap are removed. The rest are sorted by descending score and then descending date; the first three become `topMatches`.
6. All overlapping entries are also sorted chronologically into `relatedTimeline`, which records gaps between appearances and the absence after the last appearance.

The score is:

```text
score = (word_overlap_count + 1.5 × emoji_overlap_count) / union_size
```

`union_size` is the number of unique query words, entry words, query emoji, and entry emoji combined. This is a **custom emoji-weighted, Jaccard-like set-overlap score**. It is neither standard Jaccard nor cosine similarity. Because emoji count 1.5 in the numerator but 1 in the union, an emoji-only score can theoretically exceed 1; the current implementation does not clamp it to `[0, 1]`.

Each query scans the entire journal collection. With `N` entries and roughly `T` unique tokens per entry, the runtime is approximately `O(N × T)`. No vector or inverted index is precomputed.

### 2. Known-state matching

`scoreStateNode()` in `lib/state-classification.ts` implements this path. `buildScoringQuery()` first combines the raw note, situation, automatic thought, behavior, and emotion labels.

For each known state, only `label + tags` are used as its identity tokens:

```text
state_score = matched_identity_tokens / all_identity_tokens
```

The score measures how much of a known state's identity vocabulary is present in the current note. It is asymmetric and is not Jaccard: only the state node's unique identity-token count is used as the denominator. Scores are rounded to three decimal places and sorted descending.

Unless explicitly overridden, a best score below `NOVELTY_THRESHOLD = 0.38` is considered novel when the query has at least two meaningful tokens. A novel state may be persisted to `data/state-nodes.json`; an existing ID or label is reused to prevent duplicate nodes.

There is one additional local rule in `phrasesAreNearDuplicates()`. After simple suffix normalization, it uses standard token Jaccard with a `0.75` threshold to suppress near-duplicate structured fields such as behavior and situation. It is not part of historical retrieval.

### 3. LLM, storage, and the meaning of “semantic”

When `ANTHROPIC_API_KEY` is configured, `app/api/classify-state/route.ts` calls the Anthropic Messages API to extract situation, automatic thought, emotion labels, intensity, and behavior. A local heuristic supplies the same structure when the API is unavailable. In either normal path, known-state scores are computed server-side with the token-overlap method above.

The `semanticSeeds` variable in `build_relatedness_graph()` only converts existing emotions, tags, and matches into visualization nodes. It does not create embeddings or query a graph/vector database.

Current storage is:

- Historical journal: static `data/journal-entries.json`, loaded and scanned in the client.
- Known states: `data/state-nodes.json`, read on the server and potentially updated with novel states.
- Vector store: none.
- Relational/document database: none.

### 4. Fit and limitations

The current approach is small, transparent, dependency-free, and appropriate for the demo corpus. Its main limitations are:

- It cannot match synonyms without shared surface words, such as “exhausted” and “drained.”
- `normalizeToken()` retains only `[a-z0-9]`, so Chinese and other non-ASCII text produces no word tokens; emoji can still match.
- Stop-word and morphology handling are hand-written and language-limited.
- Query latency grows linearly with the collection size.
- The journal score is a custom weighted score and should not be interpreted as a probability.

If cross-language paraphrase matching or large-scale retrieval becomes necessary, embeddings, a vector index, and cosine similarity can be added as an architectural upgrade. The existing token and emoji features should remain as explainable signals in a hybrid ranker, with the combined ranking evaluated offline on representative data.

### 5. Key files

- `lib/matching.ts`: journal token/emoji matching, Top 3 selection, and time gaps.
- `lib/state-tides-service.ts`: retrieval interface and relatedness-graph assembly.
- `lib/state-classification.ts`: structured-state inference, known-state scoring, and novelty threshold.
- `lib/state-node-store.ts`: state-node JSON persistence.
- `app/api/classify-state/route.ts`: Anthropic and local-fallback classification flow.
- `app/page.tsx`: client-side retrieval calls and presentation.
- `tests/matching.test.ts`: coverage for tokenization, emoji, matching, timelines, and recurrence.
