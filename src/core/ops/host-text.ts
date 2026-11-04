// CC-WIN-3: host config files written on Windows carry a UTF-8 BOM (PowerShell 5 Set-Content/Out-File
// -Encoding UTF8) and CRLF line ends. JSON.parse throws on a BOM. One shared pair of functions: read a file as
// plain LF text for parsing and editing, then give the edited text the layout the file had. Pure, no imports
// (the hook bundle loads this through user-deny.ts). No regex: char-code and split/join only.
export interface HostLayout { bom: boolean; crlf: boolean; }

const BOM_CODE = 0xfeff;
const CR_CODE = 0x0d;
const CRLF = "\r\n";
const LF = "\n";

// OC-WIN-5: the file's dominant line end decides what inserted lines get. Count CRLF and bare LF once; CRLF wins
// a tie (a one-line file edited on Windows), a file with no CRLF is LF. A mixed file is written in one style.
export function hostLayout(raw: string): HostLayout {
  let crlf = 0;
  let lf = 0;
  for (let i = raw.indexOf(LF); i >= 0; i = raw.indexOf(LF, i + 1)) {
    if (i > 0 && raw.charCodeAt(i - 1) === CR_CODE) crlf += 1;
    else lf += 1;
  }
  return { bom: raw.length > 0 && raw.charCodeAt(0) === BOM_CODE, crlf: crlf > 0 && crlf >= lf };
}

/** The file text without a leading U+FEFF, with every CRLF turned into LF. A lone CR stays. */
export function hostText(raw: string): string {
  const bare = raw.length > 0 && raw.charCodeAt(0) === BOM_CODE ? raw.slice(1) : raw;
  return bare.indexOf(CRLF) < 0 ? bare : bare.split(CRLF).join(LF);
}

/** `text` (LF, no BOM) written the way the file it replaces was: BOM kept, LF turned back into CRLF. */
export function withLayout(text: string, layout: HostLayout): string {
  const eol = layout.crlf ? text.split(LF).join(CRLF) : text;
  return layout.bom ? String.fromCharCode(BOM_CODE) + eol : eol;
}
