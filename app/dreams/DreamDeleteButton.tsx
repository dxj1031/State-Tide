"use client";

import { useState } from "react";

type DreamDeleteButtonProps = {
  seedId: string;
};

export default function DreamDeleteButton({ seedId }: DreamDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteDream() {
    const confirmed = window.confirm("Delete this dream permanently?");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    await fetch(`/api/dreams/${seedId}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <button type="button" className="danger-button" onClick={deleteDream} disabled={isDeleting}>
      {isDeleting ? "Deleting..." : "Delete"}
    </button>
  );
}
