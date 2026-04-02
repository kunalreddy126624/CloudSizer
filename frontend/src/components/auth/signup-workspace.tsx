"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";

const SIGNUP_DRAFT_KEY = "cloudsizer.signup-request";

interface SignupDraft {
  full_name: string;
  email: string;
  company: string;
}

export function SignupWorkspace() {
  const { isAuthenticated, user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const draft = window.localStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!draft) {
      return;
    }

    try {
      const parsed = JSON.parse(draft) as SignupDraft;
      setFullName(parsed.full_name ?? "");
      setEmail(parsed.email ?? "");
      setCompany(parsed.company ?? "");
    } catch {
      window.localStorage.removeItem(SIGNUP_DRAFT_KEY);
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    if (!email.includes("@")) {
      setError("Enter a valid work email.");
      return;
    }

    if (!company.trim()) {
      setError("Company is required.");
      return;
    }

    window.localStorage.setItem(
      SIGNUP_DRAFT_KEY,
      JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        company: company.trim()
      } satisfies SignupDraft)
    );

    setSuccess(
      "Signup details saved on this device. Self-service account creation is not connected to the backend yet, so use the demo login or have an admin create the account."
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 4, md: 7 },
        display: "flex",
        alignItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(100, 167, 255, 0.18), transparent 20%), radial-gradient(circle at bottom right, rgba(12, 107, 88, 0.12), transparent 24%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)"
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
                    CloudSizer Sign Up
                  </Typography>
                  <Typography variant="h3" sx={{ lineHeight: 1.05 }}>
                    Request CloudSizer access and start with the agent estimator.
                  </Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", lineHeight: 1.7 }}>
                    Use this page to prepare your signup details. The self-service backend signup endpoint is not live yet,
                    so this works as an access-request page until account creation is connected.
                  </Typography>
                  <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Best current path
                      </Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1, lineHeight: 1.6 }}>
                        Use the demo login for immediate access, or save your details here and have an admin create the account.
                      </Typography>
                    </CardContent>
                  </Card>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button component={Link} href="/advisor" variant="contained" sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}>
                      Open Agent Estimator
                    </Button>
                    <Button component={Link} href="/login" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Go To Login
                    </Button>
                  </Stack>
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
                    <Typography variant="h4">Sign Up</Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                      Save your access request details and continue with demo access until backend signup is enabled.
                    </Typography>
                  </Box>

                  <Alert severity="info">
                    Demo login: <strong>demo@cloudsizer.local</strong> / <strong>CloudSizer123!</strong>
                  </Alert>

                  {isAuthenticated && user ? (
                    <Alert severity="success">You are already signed in as {user.full_name}. Open the workspace or agent estimator.</Alert>
                  ) : null}
                  {error ? <Alert severity="error">{error}</Alert> : null}
                  {success ? <Alert severity="success">{success}</Alert> : null}

                  <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                    <TextField
                      label="Full name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Work email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Company"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                      fullWidth
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      sx={{
                        py: 1.4,
                        bgcolor: "var(--accent)",
                        color: "#ffffff",
                        "&:hover": { bgcolor: "#265db8" }
                      }}
                    >
                      Save Signup Request
                    </Button>
                  </Stack>

                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    This page does not create a live backend account yet. It gives you a clear sign-up destination instead of repeating the same route buttons already available in the top tabs.
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
