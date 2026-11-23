import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { Modal, Button } from "../../components/billing-ui";
import { deleteAsset } from "../../service/hrService";
import { assetDeleteBlockReason } from "../../utils/assetForm";

// Confirm-and-delete for one asset (QA R1-19), shared by Organization Admin → Assets and Zoiko HR → Inventory.
// The server soft-deletes (history kept, audit-logged) and refuses an assigned asset; the dialog says so up front.
export function DeleteAssetDialog({ asset, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!asset) return null;

  const name = asset.name || asset.itemName || "this asset";
  const tag = asset.asset_tag || asset.assetTag || "";
  const blocked = assetDeleteBlockReason(asset);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      onDeleted?.(asset);
    } catch (err) {
      setError(err?.message || "The asset could not be deleted.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="Delete asset"
      icon={Trash2}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon={Trash2} loading={busy} disabled={!!blocked} onClick={confirm}>
            Delete asset
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Delete <span className="font-semibold text-slate-800">{name}</span>
          {tag && <> (<span className="font-mono text-amber-600">{tag}</span>)</>}? It is removed from the asset lists and
          counts; its maintenance history is kept and the deletion is recorded in the audit log.
        </p>
        {blocked && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {blocked}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p>
        )}
      </div>
    </Modal>
  );
}

export default DeleteAssetDialog;
