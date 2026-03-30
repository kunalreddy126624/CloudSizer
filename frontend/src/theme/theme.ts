import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#316fd6"
    },
    secondary: {
      main: "#64a7ff"
    },
    background: {
      default: "#eef5ff",
      paper: "#ffffff"
    },
    text: {
      primary: "#17315c",
      secondary: "#5f769a"
    }
  },
  shape: {
    borderRadius: 6
  },
  typography: {
    fontFamily: '"Aptos Display", "Segoe UI Variable Display", "Trebuchet MS", sans-serif',
    h1: {
      fontWeight: 800
    },
    h2: {
      fontWeight: 800
    },
    h3: {
      fontWeight: 700
    },
    h4: {
      fontWeight: 700
    },
    h5: {
      fontWeight: 700
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
      letterSpacing: "0.01em"
    }
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: "rgba(49, 111, 214, 0.12)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 20
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: "auto",
          minHeight: 36,
          alignItems: "center"
        },
        label: {
          whiteSpace: "normal",
          lineHeight: 1.3,
          paddingTop: 6,
          paddingBottom: 6
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined"
      }
    }
  }
});
