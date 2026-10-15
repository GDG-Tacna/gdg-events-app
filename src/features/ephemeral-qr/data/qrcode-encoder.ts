import { create } from "qrcode";
import type { QrEncoder } from "../domain/ports";

/**
 * Encoder over the `qrcode` library. It returns the module matrix, not an image: the screen draws it
 * as SVG, so nothing is injected as HTML. Error correction "M" survives a smudged projector or a
 * scratched phone screen without making the code denser than needed.
 */
export class QrCodeEncoder implements QrEncoder {
  encode(text: string): readonly string[] {
    const { modules } = create(text, { errorCorrectionLevel: "M" });

    const rows: string[] = [];
    for (let row = 0; row < modules.size; row += 1) {
      let line = "";
      for (let column = 0; column < modules.size; column += 1) line += modules.get(row, column) ? "1" : "0";
      rows.push(line);
    }
    return rows;
  }
}
