//! Small string-escaping helpers for the dev server.

/// Escape HTML special characters.
pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Escape a string for safe embedding inside a JSON string literal.
/// Also escapes `<` and `>` to prevent `</script>` injection when embedded in HTML.
pub fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
}
