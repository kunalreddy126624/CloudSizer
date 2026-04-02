"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";

export function LoginWorkspace() {
  const router = useRouter();
  const { isAuthenticated, login, loading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    void (async () => {
      try {
        await login(email, password, rememberMe);
        setSuccess("Signed in successfully. Redirecting to your workspace...");
        router.push("/workspace");
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
      }
    })();
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 4, md: 7 },
        display: "flex",
        alignItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(100, 167, 255, 0.18), transparent 20%), radial-gradient(circle at bottom right, rgba(49, 111, 214, 0.12), transparent 24%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)"
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} md={5}>
            <Card
              sx={{
                height: "100%",
                borderRadius: 5,
                border: "1px solid var(--line)",
                boxShadow: "none",
                bgcolor: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(16px)"
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack spacing={3}>
                  <Typography variant="overline" sx={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
                    CloudSizer Access
                  </Typography>
                  <Typography variant="h3" sx={{ lineHeight: 1.05 }}>
                    Sign in to manage cloud estimates and saved scenarios.
                  </Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", lineHeight: 1.7 }}>
                    Use this account workspace to access every CloudSizer application, saved estimates, advisor drafts,
                    and future team collaboration features.
                  </Typography>
                  <Stack spacing={1.5}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          What you get after login
                        </Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1, lineHeight: 1.6 }}>
                          Persistent estimates, team-ready planning workflows, and a cleaner handoff from advisor to pricing.
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Current status
                        </Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1, lineHeight: 1.6 }}>
                          After sign-in you land in a shared workspace with direct access to advisor, estimator,
                          pricing, architecture, catalog, and saved estimates.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Stack>
                  <Button
                    component={Link}
                    href="/"
                    variant="text"
                    sx={{ alignSelf: "flex-start", px: 0, color: "var(--accent)" }}
                  >
                    Back to Home
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card
              sx={{
                borderRadius: 5,
                border: "1px solid var(--line)",
                boxShadow: "none",
                bgcolor: "rgba(255,255,255,0.9)",
                backdropFilter: "blur(16px)"
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="h4">User Login</Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                      Sign in with your email and password to continue into CloudSizer.
                    </Typography>
                  </Box>

                  <Alert severity="info">
                    Demo access: <strong>demo@cloudsizer.local</strong> / <strong>CloudSizer123!</strong>
                  </Alert>
                  <Alert severity="info">
                    Guest users can explore the tools for 3 estimate runs total. Sign in to unlock unlimited usage,
                    saved estimates, and the full workspace.
                  </Alert>

                  {error ? <Alert severity="error">{error}</Alert> : null}
                  {success ? <Alert severity="success">{success}</Alert> : null}
                  {isAuthenticated && user ? (
                    <Alert severity="success">Signed in as {user.full_name}. Open your full workspace.</Alert>
                  ) : null}

                  <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                    <TextField
                      label="Work email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      fullWidth
                    />
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      spacing={1}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={rememberMe}
                            onChange={(event) => setRememberMe(event.target.checked)}
                          />
                        }
                        label="Remember me"
                      />
                      <Button component={Link} href="/signup" variant="text" sx={{ px: 0, color: "var(--accent)" }}>
                        Need an account?
                      </Button>
                    </Stack>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={loading}
                      sx={{
                        py: 1.4,
                        bgcolor: "var(--accent)",
                        color: "#ffffff",
                        "&:hover": { bgcolor: "#265db8" }
                      }}
                    >
                      {loading ? "Checking session..." : "Sign In"}
                    </Button>
                  </Stack>

                  <Divider />

                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    Use the shared top navigation to move between workspace, advisor, estimator, pricing,
                    architect, catalog, and saved estimates after sign-in.
                  </Typography>
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    New here? Visit the sign-up page to request access or use the demo login while signup is being finalized.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
