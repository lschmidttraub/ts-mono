import { ChangeEvent, FC, MouseEvent as ReactMouseEvent } from "react";

import {
  toggleAllSamplesSelected,
  toggleSampleSelected,
} from "../../../state/actions";
import { useStore } from "../../../state/store";
import { useCurrentLogFile } from "../../routing/currentSelection";
import { ExtendedColumnDef } from "../../shared/data-grid/columnTypes";
import { SampleRow } from "../../shared/samples-grid/types";

import styles from "./SampleSelectColumn.module.css";
import { ownedSampleSelection, sampleSelectionKey } from "./sampleSelection";

export const kSampleSelectColumnId = "sampleSelect";

const rowKey = (row: SampleRow) => sampleSelectionKey(row.sampleId, row.epoch);

// Rows are links that open the sample: keep the click from reaching the
// row, and skip the mousedown default so focus stays on the grid (arrow-key
// navigation keeps working) and shift-click doesn't select text.
const stopRowClick = (e: ReactMouseEvent) => e.stopPropagation();
const keepGridFocus = (e: ReactMouseEvent) => e.preventDefault();

const isShiftClick = (e: ChangeEvent) =>
  e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey;

const SelectAllCheckbox: FC<{ rows: SampleRow[] }> = ({ rows }) => {
  const logFile = useCurrentLogFile();
  const selection = useStore((state) => state.log.sampleSelection);
  const selected = new Set(ownedSampleSelection(selection, logFile).keys);
  const visibleKeys = rows.map(rowKey);
  const selectedCount = visibleKeys.filter((k) => selected.has(k)).length;
  const all = visibleKeys.length > 0 && selectedCount === visibleKeys.length;
  const some = selectedCount > 0 && !all;
  return (
    <input
      type="checkbox"
      className={styles.checkbox}
      aria-label={all ? "Deselect all samples" : "Select all samples"}
      title={all ? "Deselect all samples" : "Select all samples"}
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = some;
      }}
      tabIndex={-1}
      onClick={stopRowClick}
      onMouseDown={keepGridFocus}
      onChange={() => {
        if (logFile) toggleAllSamplesSelected(logFile, visibleKeys);
      }}
    />
  );
};

const SelectRowCheckbox: FC<{
  row: SampleRow;
  orderedRows: () => SampleRow[];
}> = ({ row, orderedRows }) => {
  const key = rowKey(row);
  const checked = useStore((state) =>
    ownedSampleSelection(state.log.sampleSelection, row.logFile).keys.includes(
      key
    )
  );
  return (
    <input
      type="checkbox"
      className={styles.checkbox}
      aria-label={`Select sample ${row.sampleId} (epoch ${row.epoch})`}
      checked={checked}
      tabIndex={-1}
      onClick={stopRowClick}
      onMouseDown={keepGridFocus}
      onChange={(e) =>
        toggleSampleSelected(
          row.logFile,
          key,
          orderedRows().map(rowKey),
          isShiftClick(e)
        )
      }
    />
  );
};

/** Pinned checkbox column for picking samples to export. The header box
 *  covers the rows currently shown (after filtering); shift-click selects a
 *  range in display order. */
export const sampleSelectColumn: ExtendedColumnDef<SampleRow> = {
  id: kSampleSelectColumnId,
  header: ({ table }) => (
    <SelectAllCheckbox rows={table.getRowModel().rows.map((r) => r.original)} />
  ),
  headerTitle: "Select samples (shift-click selects a range)",
  size: 32,
  minSize: 32,
  maxSize: 32,
  enableSorting: false,
  enableResizing: false,
  pinned: "start",
  meta: { align: "center" },
  cell: ({ row, table }) => (
    <SelectRowCheckbox
      row={row.original}
      orderedRows={() => table.getRowModel().rows.map((r) => r.original)}
    />
  ),
};
