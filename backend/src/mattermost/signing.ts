import { createHmac, timingSafeEqual } from "node:crypto";
import { isNonEmptyString } from "../http/error-mapping";

export type MattermostInteractiveAction = "confirm" | "regrade";

export function createMattermostSigner(secret: string | undefined) {
  function sign(
    action: MattermostInteractiveAction,
    evaluationId: string,
    submissionId: string,
    version: number,
  ) {
    if (!isNonEmptyString(secret)) return "";
    return createHmac("sha256", secret)
      .update(`${action}:${evaluationId}:${submissionId}:${version}`)
      .digest("hex");
  }

  function verify(
    action: MattermostInteractiveAction,
    evaluationId: string,
    submissionId: string,
    version: number,
    signature: string,
  ) {
    const expected = sign(action, evaluationId, submissionId, version);
    if (!expected || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  }

  return { sign, verify };
}

export type MattermostSigner = ReturnType<typeof createMattermostSigner>;
