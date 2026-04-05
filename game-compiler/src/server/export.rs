//! Framework export helpers — React wrapper, Vue SFC, CSS-only fallback.

/// Convert a kebab-case tag name (`game-boot-ring`) to PascalCase (`GameBootRing`).
pub fn to_pascal_case(tag_name: &str) -> String {
    tag_name
        .split('-')
        .filter(|s| !s.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(c) => {
                    let mut s = c.to_uppercase().to_string();
                    s.extend(chars);
                    s
                }
                None => String::new(),
            }
        })
        .collect()
}

/// Generate a React wrapper component (JSX) for the compiled Web Component.
pub fn generate_react(js: &str, tag_name: &str) -> String {
    let pascal = to_pascal_case(tag_name);
    format!(
        r#"// React wrapper for <{tag_name}> — auto-generated
import {{ useRef, useEffect }} from 'react';

// Inline the Web Component registration
const _register = (() => {{
{js}
}})();

export default function {pascal}({{ style, className, ...params }}) {{
  const elRef = useRef(null);

  useEffect(() => {{
    const el = elRef.current;
    if (!el) return;
    for (const [k, v] of Object.entries(params)) {{
      el.setAttribute(k, String(v));
    }}
  }}, [params]);

  return <{tag_name} ref={{elRef}} style={{style}} className={{className}} />;
}}
"#
    )
}

/// Generate a Vue Single File Component wrapper for the compiled Web Component.
pub fn generate_vue(js: &str, tag_name: &str) -> String {
    let pascal = to_pascal_case(tag_name);
    format!(
        r#"<!-- Vue SFC wrapper for <{tag_name}> — auto-generated -->
<template>
  <{tag_name} ref="el" v-bind="$attrs" />
</template>

<script setup>
// Inline the Web Component registration
{js}

defineOptions({{ name: '{pascal}' }});
</script>
"#
    )
}

/// Generate a CSS-only animated fallback (no WebGPU / WebGL required).
pub fn generate_css_fallback(tag_name: &str) -> String {
    format!(
        r#"/* CSS-only fallback for <{tag_name}> — auto-generated */
{tag_name} {{
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0a0a0a 0%, #1f1f1f 100%);
  animation: {tag_name}-pulse 4s ease-in-out infinite;
}}

@keyframes {tag_name}-pulse {{
  0%, 100% {{ opacity: 0.7; }}
  50% {{ opacity: 1; }}
}}
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pascal_case_conversion() {
        assert_eq!(to_pascal_case("game-hello"), "GameHello");
        assert_eq!(to_pascal_case("game-boot-ring"), "GameBootRing");
        assert_eq!(to_pascal_case("game-x"), "GameX");
        assert_eq!(to_pascal_case("single"), "Single");
    }
}
