"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { uploadTaskFiles, type Uploaded } from "@/lib/upload-client";
import { reviewTaskAction, submitTaskAction } from "../actions";
import { addFilesAction } from "../ops-actions";

/**
 * Files go straight from the browser to the private bucket (Storage RLS checks
 * the task), then the submission + file records are written in one RPC.
 */
export function SubmitWorkForm({
  taskId,
  orgId,
  labels,
}: {
  taskId: string;
  orgId: string;
  labels: { title: string; note: string; files: string; send: string; uploading: string; tooLarge: string; uploadFailed: string };
}) {
  const [state, action] = useActionState(submitTaskAction, undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadThenSubmit(formData: FormData) {
    setUploadError(null);
    const files = Array.from(fileInputRef.current?.files ?? []);
    let uploaded: Uploaded[] = [];
    if (files.length) {
      setUploading(true);
      const result = await uploadTaskFiles(orgId, taskId, files);
      setUploading(false);
      if (!result.ok) {
        setUploadError(result.error === "too_large" ? labels.tooLarge : labels.uploadFailed);
        return;
      }
      uploaded = result.uploaded;
    }
    formData.set("attachments", JSON.stringify(uploaded));
    formData.delete("files");
    action(formData);
  }

  if (state?.message === "ok") return null;
  return (
    <form action={uploadThenSubmit} className="flex flex-col gap-3">
      <h2 className="font-semibold">{labels.title}</h2>
      <input type="hidden" name="taskId" value={taskId} />
      <Field label={labels.note} htmlFor="submit-note">
        <Textarea id="submit-note" name="note" maxLength={5000} rows={3} />
      </Field>
      <Field label={labels.files} htmlFor="submit-files">
        <input
          id="submit-files"
          name="files"
          ref={fileInputRef}
          type="file"
          multiple
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-text"
          accept=".pdf,.zip,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,video/mp4,video/quicktime,video/webm"
        />
      </Field>
      {uploadError ? <Alert>{uploadError}</Alert> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingLabel={labels.uploading} disabled={uploading} className="self-start">
        {uploading ? labels.uploading : labels.send}
      </SubmitButton>
    </form>
  );
}

export function ReviewForm({
  taskId,
  labels,
}: {
  taskId: string;
  labels: { title: string; awaiting: string; comment: string; approve: string; revise: string; pending: string };
}) {
  const [state, action, pending] = useActionState(reviewTaskAction, undefined);
  if (state?.message === "ok") return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">{labels.title}</h2>
        <p className="text-xs text-muted">{labels.awaiting}</p>
      </div>
      <input type="hidden" name="taskId" value={taskId} />
      <Field label={labels.comment} htmlFor="review-comment">
        <Textarea id="review-comment" name="comment" maxLength={5000} rows={3} />
      </Field>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approved" disabled={pending}>
          {pending ? labels.pending : labels.approve}
        </Button>
        <Button type="submit" name="decision" value="revision_required" variant="secondary" disabled={pending}>
          {labels.revise}
        </Button>
      </div>
    </form>
  );
}

/** Adds working files to a task; a file with an existing name becomes its next version. */
export function AddFilesForm({
  taskId,
  orgId,
  labels,
}: {
  taskId: string;
  orgId: string;
  labels: { upload: string; uploading: string; tooLarge: string; uploadFailed: string };
}) {
  const [state, action] = useActionState(addFilesAction, undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadThenRecord(formData: FormData) {
    setError(null);
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) return;
    setBusy(true);
    const result = await uploadTaskFiles(orgId, taskId, files);
    setBusy(false);
    if (!result.ok) {
      setError(result.error === "too_large" ? labels.tooLarge : labels.uploadFailed);
      return;
    }
    formData.set("attachments", JSON.stringify(result.uploaded));
    formData.delete("files");
    action(formData);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={uploadThenRecord} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input
        ref={inputRef}
        name="files"
        type="file"
        multiple
        aria-label={labels.upload}
        className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-text"
        accept=".pdf,.zip,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,video/mp4,video/quicktime,video/webm"
      />
      <SubmitButton variant="secondary" disabled={busy} pendingLabel={labels.uploading}>
        {busy ? labels.uploading : labels.upload}
      </SubmitButton>
      {error ? <Alert>{error}</Alert> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}
