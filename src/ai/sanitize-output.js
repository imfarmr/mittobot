// AI-generated content must never be able to trigger a mass or role mention.
// `allowedMentions` is the enforcement layer; this transformation also renders
// dangerous mention syntax inert if the content is copied or forwarded later.
const SAFE_ALLOWED_MENTIONS = Object.freeze({ parse: [], repliedUser: false });

function sanitizeAiOutput(value) {
  return String(value ?? "")
    .replace(/@(everyone|here)\b/gi, "@\u200b$1")
    .replace(/<@&(\d{17,20})>/g, "<@\u200b&$1");
}

module.exports = { SAFE_ALLOWED_MENTIONS, sanitizeAiOutput };
