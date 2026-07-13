"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Edit, UserCheck, UserX, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { adminService } from "@/services/admin.service";
import type { User } from "@/services/admin.service";
import { format } from "date-fns";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    login: "",
    firstName: "",
    lastName: "",
    email: "",
    authorities: ["ROLE_USER"] as string[],
    password: "",
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.listUsers(0, 100);
      setUsers(result.content);
    } catch {
      toast("error", "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async () => {
    if (!formData.login.trim() || !formData.email.trim()) {
      toast("warning", "Login and email are required");
      return;
    }
    try {
      await adminService.createUser({
        login: formData.login,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        authorities: formData.authorities,
        activated: true,
      });
      toast("success", "User created", `${formData.login} has been created`);
      setShowCreatePanel(false);
      resetForm();
      loadUsers();
    } catch {
      toast("error", "Failed to create user");
    }
  };

  const handleToggleActivation = async (user: User) => {
    try {
      if (user.activated) {
        await adminService.deactivateUser(user.login);
        toast("success", "User deactivated");
      } else {
        await adminService.activateUser(user.login);
        toast("success", "User activated");
      }
      loadUsers();
    } catch {
      toast("error", "Failed to update user status");
    }
  };

  const handleDelete = async (login: string) => {
    try {
      await adminService.deleteUser(login);
      toast("success", "User deleted");
      setDeleteConfirm(null);
      loadUsers();
    } catch {
      toast("error", "Failed to delete user");
    }
  };

  const resetForm = () => {
    setFormData({ login: "", firstName: "", lastName: "", email: "", authorities: ["ROLE_USER"], password: "" });
  };

  const filteredUsers = users.filter((u) =>
    u.login.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Users</h1>
          <p className="text-secondary text-small mt-0.5">Manage users, roles and permissions</p>
        </div>
        <button onClick={() => setShowCreatePanel(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Create User
        </button>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder="Search users by login or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-base w-full pl-9"
        />
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title={searchQuery ? "No users match" : "No users"}
            description={searchQuery ? "Try a different search term" : "Create your first user to get started"}
            action={
              !searchQuery ? (
                <button onClick={() => setShowCreatePanel(true)} className="btn-primary">
                  <Plus className="w-4 h-4" /> Create User
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Login</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Email</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Roles</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Created</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                    <td className="px-4 py-3 text-body text-primary font-medium">{user.login}</td>
                    <td className="px-4 py-3 text-small text-secondary">{user.email || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {user.authorities.map((role) => (
                          <span
                            key={role}
                            className={cn(
                              "px-2 py-0.5 rounded text-tiny font-medium",
                              role === "ROLE_ADMIN"
                                ? "bg-purple-500/10 text-purple-400"
                                : "bg-surface-tertiary text-secondary"
                            )}
                          >
                            {role.replace("ROLE_", "")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium",
                        user.activated
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      )}>
                        {user.activated ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-small text-muted">
                      {user.createdDate ? format(new Date(user.createdDate), "MMM dd, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActivation(user)}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            user.activated
                              ? "hover:bg-red-500/10 text-muted hover:text-red-400"
                              : "hover:bg-green-500/10 text-muted hover:text-green-400"
                          )}
                        >
                          {user.activated ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                        {deleteConfirm === user.login ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(user.login)}
                              className="px-2 py-0.5 text-tiny rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            >
                              Confirm
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-muted hover:text-primary">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(user.login)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Panel */}
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreatePanel(false)} />
          <div className="relative card w-[480px] p-6 shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-primary">Create User</h3>
              <button onClick={() => setShowCreatePanel(false)} className="text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-small text-secondary block mb-1">Login</label>
                <input
                  type="text"
                  value={formData.login}
                  onChange={(e) => setFormData((p) => ({ ...p, login: e.target.value }))}
                  className="input-base w-full"
                  placeholder="Username"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-small text-secondary block mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                    className="input-base w-full"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="text-small text-secondary block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                    className="input-base w-full"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div>
                <label className="text-small text-secondary block mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="input-base w-full"
                  placeholder="user@company.com"
                />
              </div>
              <div>
                <label className="text-small text-secondary block mb-1">Role</label>
                <select
                  value={formData.authorities[0]}
                  onChange={(e) => setFormData((p) => ({ ...p, authorities: [e.target.value] }))}
                  className="input-base w-full"
                >
                  <option value="ROLE_USER">User</option>
                  <option value="ROLE_ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-small text-secondary block mb-1">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  className="input-base w-full"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => { setShowCreatePanel(false); resetForm(); }} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleCreate} className="btn-primary">
                  Create User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
