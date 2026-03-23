//! DOM overlay codegen for component UI layer.
//!
//! Generates HTML template and CSS for text elements overlaid on the GPU canvas.
//! String props are bound to DOM element textContent via JavaScript.

use crate::ast::{Cinematic, Expr};

use super::StringPropInfo;

/// Extract string-typed properties from the props block.
pub fn extract_string_props(cinematic: &Cinematic) -> Vec<StringPropInfo> {
    let Some(ref props_block) = cinematic.props else {
        return vec![];
    };
    props_block
        .props
        .iter()
        .filter_map(|p| {
            if p.is_event {
                return None;
            }
            match &p.default {
                Expr::String(s) => Some(StringPropInfo {
                    name: p.name.clone(),
                    default: s.clone(),
                }),
                _ => None,
            }
        })
        .collect()
}

/// Generate DOM overlay HTML and CSS from the dom block.
///
/// Returns `(Some(html), Some(css))` if a dom block is present, `(None, None)` otherwise.
pub fn generate_dom(cinematic: &Cinematic) -> (Option<String>, Option<String>) {
    let Some(ref dom_block) = cinematic.dom else {
        return (None, None);
    };

    if dom_block.elements.is_empty() {
        return (None, None);
    }

    let mut html = String::new();
    let mut css = String::new();

    for el in &dom_block.elements {
        let class_name = format!("game-dom-{}", el.name.replace(' ', "-"));
        let html_tag = match el.tag.as_str() {
            "text" => "span",
            "div" => "div",
            _ => "span",
        };

        // HTML element with data-bind attribute for JS wiring
        if let Some(ref bind) = el.bind {
            html.push_str(&format!(
                "<{html_tag} class=\"{class_name}\" data-bind=\"{bind}\"></{html_tag}>"
            ));
        } else {
            html.push_str(&format!(
                "<{html_tag} class=\"{class_name}\"></{html_tag}>"
            ));
        }

        // CSS positioning + user styles
        css.push_str(&format!(
            ".{class_name}{{position:absolute;left:{x}px;top:{y}px;{style}}}",
            class_name = class_name,
            x = el.x,
            y = el.y,
            style = el.style,
        ));
    }

    (Some(html), Some(css))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_cinematic_with_dom() -> Cinematic {
        Cinematic {
            name: "test-card".into(),
            layers: vec![],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            react: None,
            swarm: None,
            flow: None,
            passes: vec![],
            cinematic_uses: vec![],
            matrix_coupling: None,
            matrix_color: None,
            props: Some(PropsBlock {
                props: vec![
                    PropDef {
                        name: "title".into(),
                        default: Expr::String("Hello".into()),
                        is_event: false,
                    },
                    PropDef {
                        name: "glow".into(),
                        default: Expr::Number(1.5),
                        is_event: false,
                    },
                    PropDef {
                        name: "on_click".into(),
                        default: Expr::String(String::new()),
                        is_event: true,
                    },
                ],
            }),
            dom: Some(DomBlock {
                elements: vec![DomElement {
                    tag: "text".into(),
                    name: "title".into(),
                    x: 72.0,
                    y: 12.0,
                    style: "font:600 14px Inter;color:#FFF".into(),
                    bind: Some("title".into()),
                }],
            }),
            events: vec![EventHandler {
                event: "click".into(),
                emit: Some("dismiss".into()),
            }],
            role: Some("alert".into()),
        }
    }

    #[test]
    fn extract_string_props_filters_correctly() {
        let cin = make_cinematic_with_dom();
        let props = extract_string_props(&cin);
        assert_eq!(props.len(), 1);
        assert_eq!(props[0].name, "title");
        assert_eq!(props[0].default, "Hello");
    }

    #[test]
    fn generate_dom_html_and_css() {
        let cin = make_cinematic_with_dom();
        let (html, css) = generate_dom(&cin);
        let html = html.unwrap();
        let css = css.unwrap();
        assert!(html.contains("game-dom-title"));
        assert!(html.contains("data-bind=\"title\""));
        assert!(css.contains("left:72px"));
        assert!(css.contains("top:12px"));
        assert!(css.contains("font:600 14px Inter"));
    }

    #[test]
    fn no_dom_block_returns_none() {
        let cin = Cinematic {
            name: "no-dom".into(),
            layers: vec![],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            react: None,
            swarm: None,
            flow: None,
            passes: vec![],
            cinematic_uses: vec![],
            matrix_coupling: None,
            matrix_color: None,
            props: None,
            dom: None,
            events: vec![],
            role: None,
        };
        let (html, css) = generate_dom(&cin);
        assert!(html.is_none());
        assert!(css.is_none());
    }
}
