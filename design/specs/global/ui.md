# UI Spec

iconSet: ionicons            # ionicons | material-community | feather
uiKit: none                  # none | react-native-paper | tamagui | native-base
theme: system                # system | light | dark

colors:
  # Light mode
  backgroundLight: "#ffffff"
  surfaceLight:    "#ffffff"
  textPrimaryLight:   "#111111"
  textSecondaryLight: "#555555"
  borderLight:     "#dddddd"
  bannerErrorLight: "#ffeeee"
  # Dark mode
  backgroundDark: "#000000"
  surfaceDark:    "#111111"
  textPrimaryDark:   "#eeeeee"
  textSecondaryDark: "#bbbbbb"
  borderDark:     "#333333"
  bannerErrorDark: "#330000"

spacing: [4, 8, 12, 16, 20, 24]

typography:
  title:
    size: 20
    weight: 600
  body:
    size: 16
    weight: 400
  small:
    size: 12
    weight: 400

notes:
- Semantic names map to RN components; refine over time.
- Choose icon names from the selected icon set; adjust per platform if needed.
- Navigation theming can adopt these colors via a navigation theme if/when added.


