import type { Group } from "./types";
import type { StudioDefaults } from "../PieceSettings";
export type PieceEditorProps = {
  groups: Group[];
  target: string | null;
  backgroundReady: boolean;
  onChange: () => Promise<void>;
  onChoosePortrait: () => void;
  onDirtyChange: (dirty: boolean) => void;
  defaults: StudioDefaults;
};
