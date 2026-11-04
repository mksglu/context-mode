// impl/03 §3, TECH-SPEC GP4 "output cut is code-point safe" (#903, #1176), DEVIATIONS D-M2-6, D-M2-T5-1.
// Pure function. The caller passes the cap (OUTPUT_CAP, REPORT_CAP, ...); nothing is read here.
import { StringDecoder } from "node:string_decoder";

export function capBytes(s: string, cap: number): { text: string; cut: boolean; fullBytes: number } {
  const buf = Buffer.from(s, "utf8");
  const fullBytes = buf.length;
  if (fullBytes <= cap) return { text: s, cut: false, fullBytes };
  // Steps 3-5: a UTF-8 StringDecoder emits only whole code points and holds back the
  // sequence that straddles byte `cap`, so the prefix never ends inside a multi-byte
  // sequence or a surrogate pair (D-M2-T5-1: same result as the backward continuation-byte walk).
  const text = new StringDecoder("utf8").write(buf.subarray(0, cap));
  return { text, cut: true, fullBytes };
}
