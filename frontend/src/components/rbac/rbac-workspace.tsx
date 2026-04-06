"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { assignRbacUserRoles, createRbacUser, listRbacUsers } from "@/lib/api";
import type { PermissionName, RbacAuthenticatedUser, RoleName } from "@/lib/types";

const roleOptions: RoleName[] = ["admin", "architect", "approver", "finops", "operator", "viewer"];

const roleDescriptions: Record<RoleName, string> = {
  admin: "Full administrative access.",
  architect: "Creates estimations and reviews platform designs.",
  approver: "Approves or rejects allocation requests.",
  finops: "Reviews cost data and budgets.",
  operator: "Triggers provisioning after approval.",
  viewer: "Read-only estimation access."
};

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function RbacWorkspace() {
  const { isAuthenticated, isRbacSession, hasPermission, principal } = useAuth();
  const canManageUsers = hasPermission("manage_users");
  const [users, setUsers] = useState<RbacAuthenticatedUser[]>([]);
  const [draftRolesByUser, setDraftRolesByUser] = useState<Record<number, RoleName[]>>({});
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<RoleName[]>(["viewer"]);

  const synchronizeRoleDrafts = useCallback((items: RbacAuthenticatedUser[]) => {
    const nextDrafts: Record<number, RoleName[]> = {};
    for (const user of items) {
      nextDrafts[user.id] = user.roles.map((role) => role.name);
    }
    setDraftRolesByUser(nextDrafts);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isRbacSession || !canManageUsers) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listRbacUsers();
      setUsers(response);
      synchronizeRoleDrafts(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load RBAC users.");
    } finally {
      setLoading(false);
    }
  }, [canManageUsers, isRbacSession, synchronizeRoleDrafts]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const toggleDraftRole = useCallback((userId: number, role: RoleName, checked: boolean) => {
    setDraftRolesByUser((current) => {
      const existing = current[userId] ?? [];
      const nextRoles = checked
        ? Array.from(new Set([...existing, role]))
        : existing.filter((entry) => entry !== role);
      return {
        ...current,
        [userId]: nextRoles
      };
    });
  }, []);

  const toggleNewUserRole = useCallback((role: RoleName, checked: boolean) => {
    setNewUserRoles((current) =>
      checked ? Array.from(new Set([...current, role])) : current.filter((entry) => entry !== role)
    );
  }, []);

  const saveUserRoles = useCallback(
    async (userId: number) => {
      const nextRoles = draftRolesByUser[userId] ?? [];
      if (nextRoles.length === 0) {
        setError("At least one role is required.");
        return;
      }
      setSavingUserId(userId);
      setError(null);
      setNotice(null);
      try {
        const updated = await assignRbacUserRoles(userId, { roles: nextRoles });
        setUsers((current) => current.map((item) => (item.id === userId ? updated : item)));
        setDraftRolesByUser((current) => ({ ...current, [userId]: updated.roles.map((role) => role.name) }));
        setNotice(`Updated roles for ${updated.email}.`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Failed to update user roles.");
      } finally {
        setSavingUserId(null);
      }
    },
    [draftRolesByUser]
  );

  const createUserRecord = useCallback(async () => {
    setError(null);
    setNotice(null);

    if (!newUserEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (newUserName.trim().length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }
    if (newUserPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newUserRoles.length === 0) {
      setError("Select at least one role for the new user.");
      return;
    }

    setLoading(true);
    try {
      const created = await createRbacUser({
        email: newUserEmail.trim(),
        full_name: newUserName.trim(),
        password: newUserPassword,
        roles: newUserRoles
      });
      const nextUsers = [created, ...users];
      setUsers(nextUsers);
      synchronizeRoleDrafts(nextUsers);
      setNotice(`Created RBAC user ${created.email}.`);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRoles(["viewer"]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create RBAC user.");
    } finally {
      setLoading(false);
    }
  }, [newUserEmail, newUserName, newUserPassword, newUserRoles, synchronizeRoleDrafts, users]);

  const permissionCatalog = useMemo(() => {
    const names = new Set<PermissionName>();
    for (const user of users) {
      for (const role of user.roles) {
        for (const permission of role.permissions) {
          names.add(permission.name);
        }
      }
    }
    return Array.from(names).sort();
  }, [users]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 4, md: 6 },
        background:
          "radial-gradient(circle at top left, rgba(20, 120, 160, 0.16), transparent 25%), radial-gradient(circle at bottom right, rgba(24, 78, 160, 0.12), transparent 22%), linear-gradient(180deg, #f8fcff 0%, #eef5fb 100%)"
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={1.25}>
                <Chip label="RBAC Console" sx={{ width: "fit-content", bgcolor: "#eef6ff", color: "#1c4f95", fontWeight: 700 }} />
                <Typography variant="h4">Roles and Permissions</Typography>
                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                  Manage RBAC users and assign roles directly from the UI.
                </Typography>
                {principal ? (
                  <Alert severity="info">
                    Signed in as {principal.email}. Active roles: {principal.roles.length ? principal.roles.join(", ") : "none"}.
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          {!isAuthenticated ? <Alert severity="warning">Sign in first to access RBAC management.</Alert> : null}
          {isAuthenticated && !isRbacSession ? (
            <Alert severity="warning">
              This session does not include RBAC roles. Sign in with an RBAC JWT to manage users and role assignments.
            </Alert>
          ) : null}
          {isRbacSession && !canManageUsers ? (
            <Alert severity="error">
              You are authenticated with RBAC, but this account is missing the <strong>manage_users</strong> permission.
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success">{notice}</Alert> : null}

          {isRbacSession && canManageUsers ? (
            <>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6">Create RBAC User</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <TextField
                          fullWidth
                          label="Email"
                          value={newUserEmail}
                          onChange={(event) => setNewUserEmail(event.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          fullWidth
                          label="Full Name"
                          value={newUserName}
                          onChange={(event) => setNewUserName(event.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          fullWidth
                          label="Password"
                          type="password"
                          value={newUserPassword}
                          onChange={(event) => setNewUserPassword(event.target.value)}
                        />
                      </Grid>
                    </Grid>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {roleOptions.map((role) => (
                        <FormControlLabel
                          key={`new-user-role-${role}`}
                          control={
                            <Checkbox
                              checked={newUserRoles.includes(role)}
                              onChange={(_, checked) => toggleNewUserRole(role, checked)}
                            />
                          }
                          label={titleize(role)}
                        />
                      ))}
                    </Stack>
                    <Button variant="contained" onClick={() => void createUserRecord()} disabled={loading} sx={{ width: "fit-content" }}>
                      {loading ? "Working..." : "Create User"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2.25}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                      <Typography variant="h6">RBAC Users</Typography>
                      <Button variant="outlined" onClick={() => void loadUsers()} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </Stack>
                    {users.length ? (
                      users.map((user) => {
                        const roleDraft = draftRolesByUser[user.id] ?? [];
                        const permissions = Array.from(
                          new Set(user.roles.flatMap((role) => role.permissions.map((permission) => permission.name)))
                        ).sort();
                        return (
                          <Card key={user.id} sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "#fbfdff" }}>
                            <CardContent sx={{ p: 2.2 }}>
                              <Stack spacing={1.5}>
                                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                      {user.full_name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      {user.email}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    label={user.is_active ? "Active" : "Inactive"}
                                    color={user.is_active ? "success" : "default"}
                                    variant={user.is_active ? "filled" : "outlined"}
                                  />
                                </Stack>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {user.roles.map((role) => (
                                    <Chip key={`${user.id}-${role.name}`} label={titleize(role.name)} variant="outlined" />
                                  ))}
                                </Stack>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {permissions.map((permission) => (
                                    <Chip key={`${user.id}-perm-${permission}`} label={titleize(permission)} size="small" sx={{ bgcolor: "#eef6ff" }} />
                                  ))}
                                </Stack>
                                <Divider />
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  Assign Roles
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {roleOptions.map((role) => (
                                    <FormControlLabel
                                      key={`${user.id}-draft-role-${role}`}
                                      control={
                                        <Checkbox
                                          checked={roleDraft.includes(role)}
                                          onChange={(_, checked) => toggleDraftRole(user.id, role, checked)}
                                        />
                                      }
                                      label={titleize(role)}
                                    />
                                  ))}
                                </Stack>
                                <Button
                                  variant="contained"
                                  sx={{ width: "fit-content" }}
                                  disabled={savingUserId === user.id || roleDraft.length === 0}
                                  onClick={() => void saveUserRoles(user.id)}
                                >
                                  {savingUserId === user.id ? "Saving..." : "Save Role Assignment"}
                                </Button>
                              </Stack>
                            </CardContent>
                          </Card>
                        );
                      })
                    ) : (
                      <Alert severity="info">No RBAC users found.</Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Permission Catalog (Observed)</Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      Permissions visible from current role mappings in user records.
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {permissionCatalog.length ? (
                        permissionCatalog.map((permission) => (
                          <Chip key={`permission-${permission}`} label={titleize(permission)} variant="outlined" />
                        ))
                      ) : (
                        <Chip label="No permissions visible yet" variant="outlined" />
                      )}
                    </Stack>
                    <Divider />
                    <Grid container spacing={1.5}>
                      {roleOptions.map((role) => (
                        <Grid item xs={12} md={6} key={`role-desc-${role}`}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {titleize(role)}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            {roleDescriptions[role]}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </Stack>
                </CardContent>
              </Card>
            </>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
