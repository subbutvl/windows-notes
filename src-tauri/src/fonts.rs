//! Font families installed on this PC, read from the registry so the list is
//! instant and needs no font files to be opened.

/// Style words Windows appends to a face name ("Segoe UI Semibold Italic").
const STYLE_WORDS: &[&str] = &[
    "Regular", "Bold", "Italic", "Oblique", "Light", "Semilight", "SemiLight", "Semibold", "SemiBold", "Demibold",
    "DemiBold", "Medium", "Black", "Heavy", "Thin", "Hairline", "ExtraLight", "UltraLight", "ExtraBold", "UltraBold",
    "Condensed", "SemiCondensed", "Narrow", "Variable", "BoldItalic", "BI", "Extra", "Ultra", "Semi", "Demi",
];

/// Turns a registry value name such as "Cambria & Cambria Math (TrueType)"
/// into its family names: ["Cambria", "Cambria Math"].
pub fn family_names(value_name: &str) -> Vec<String> {
    let base = value_name.split('(').next().unwrap_or("").trim();
    base.split(" & ")
        .filter_map(|face| {
            // PostScript-style names: "LG Display-Regular" → "LG Display".
            let face = match face.rsplit_once('-') {
                Some((family, style)) if !family.is_empty() && STYLE_WORDS.contains(&style.trim()) => family,
                _ => face,
            };
            let mut words: Vec<&str> = face.split_whitespace().collect();
            while words.len() > 1 && words.last().is_some_and(|w| STYLE_WORDS.contains(w)) {
                words.pop();
            }
            let name = words.join(" ");
            // "@" faces are vertical CJK variants, not something to pick.
            (!name.is_empty() && !name.starts_with('@')).then_some(name)
        })
        .collect()
}

#[cfg(windows)]
pub fn system_fonts() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
    let mut names = std::collections::BTreeSet::new();
    // Machine-wide fonts, then fonts installed for this user only.
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(hive).open_subkey(KEY) else { continue };
        for (value_name, _) in key.enum_values().flatten() {
            names.extend(family_names(&value_name));
        }
    }
    names.into_iter().collect()
}

#[cfg(not(windows))]
pub fn system_fonts() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::family_names;

    #[test]
    fn strips_type_and_styles() {
        assert_eq!(family_names("Arial (TrueType)"), ["Arial"]);
        assert_eq!(family_names("Segoe UI Semibold Italic (TrueType)"), ["Segoe UI"]);
        assert_eq!(family_names("Arial Bold Italic (TrueType)"), ["Arial"]);
    }

    #[test]
    fn splits_collections_and_skips_vertical_faces() {
        assert_eq!(family_names("Cambria & Cambria Math (TrueType)"), ["Cambria", "Cambria Math"]);
        assert_eq!(family_names("MS Gothic & MS UI Gothic & @MS Gothic (TrueType)"), ["MS Gothic", "MS UI Gothic"]);
    }

    #[test]
    fn strips_postscript_style_suffix() {
        assert_eq!(family_names("LG Display-Regular (TrueType)"), ["LG Display"]);
        assert_eq!(family_names("FlexDisplay-Thin (OpenType)"), ["FlexDisplay"]);
        assert_eq!(family_names("Noto Sans-Kannada (TrueType)"), ["Noto Sans-Kannada"]);
    }

    #[test]
    fn keeps_single_word_families() {
        assert_eq!(family_names("Bold"), ["Bold"]);
        assert_eq!(family_names("Consolas"), ["Consolas"]);
    }
}
