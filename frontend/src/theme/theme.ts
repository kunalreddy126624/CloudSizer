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
          minHeight: 44,
          paddingInline: 20,
          fontWeight: 800,
          transition: "transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease",
          "&:hover": {
            transform: "translateY(-1px)"
          },
          "&:focus-visible": {
            outline: "3px solid rgba(49, 111, 214, 0.22)",
            outlineOffset: 2
          }
        },
        contained: {
          border: "2px solid rgba(255,255,255,0.72)",
          boxShadow: "0 14px 28px rgba(23, 49, 92, 0.18)",
          "&:hover": {
            boxShadow: "0 18px 32px rgba(23, 49, 92, 0.24)"
          }
        },
        outlined: {
          borderWidth: 2,
          backgroundColor: "rgba(255,255,255,0.42)",
          "&:hover": {
            borderWidth: 2,
            backgroundColor: "rgba(49, 111, 214, 0.08)"
          }
        },
        text: {
          backgroundColor: "rgba(255,255,255,0.34)",
          "&:hover": {
            backgroundColor: "rgba(49, 111, 214, 0.08)"
          }
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
