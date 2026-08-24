import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Cierra al hacer click en el backdrop. Default true. */
  dismissOnBackdrop?: boolean;
  /** Cierra con Escape. Default true. */
  dismissOnEsc?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
  dismissOnEsc = true,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dismissOnEsc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissOnEsc, onClose]);

  useEffect(() => {
    if (!open) return;
    // Enfocar el diálogo para atajos y accesibilidad
    dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        {description ? (
          <p id={descId} className="modal-description">
            {description}
          </p>
        ) : null}
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

type ConfirmProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Si es truthy, pide escribir esta palabra exacta antes de confirmar. */
  typeToConfirm?: string;
  /** Motivo requerido (min 5 chars) — solicitado como textarea. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onCancel: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  typeToConfirm,
  requireReason = false,
  reasonPlaceholder,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setReason('');
    setConfirmText('');
    setBusy(false);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const reasonOk = !requireReason || reason.trim().length >= 5;
  const typeOk = !typeToConfirm || confirmText.trim() === typeToConfirm;
  const canConfirm = reasonOk && typeOk && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    try {
      setBusy(true);
      await onConfirm(requireReason ? reason.trim() : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      size="sm"
      dismissOnBackdrop={!busy}
      dismissOnEsc={!busy}
      footer={
        <>
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn danger' : 'btn amber'}
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      {requireReason ? (
        <div className="field" style={{ minWidth: 320 }}>
          <label htmlFor="confirm-reason">Motivo (mínimo 5 caracteres)</label>
          <textarea
            id="confirm-reason"
            rows={3}
            value={reason}
            placeholder={reasonPlaceholder}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}
      {typeToConfirm ? (
        <div className="field" style={{ minWidth: 320, marginTop: '0.75rem' }}>
          <label htmlFor="confirm-type">
            Escribí <code>{typeToConfirm}</code> para confirmar
          </label>
          <input
            id="confirm-type"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus={!requireReason}
          />
        </div>
      ) : null}
    </Modal>
  );
}
