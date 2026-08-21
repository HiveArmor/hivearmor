/**
 * UserDrawer — Create/Edit User Drawer
 * ADM-01 §9
 */

import { useState, useEffect } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createUser, deleteUser, updateUser } from '../adminUsers.service';
import type { AuthorityDTO, UserDTO, UserFormData, UserFormErrors } from '../adminUsers.types';

import { HaButton } from '@/components/ha-button';
import { HaDrawer } from '@/components/ha-drawer';
import { HaFormGroup } from '@/components/ha-form-group';
import { HaSelect } from '@/components/ha-select';
import { HaTextInput } from '@/components/ha-text-input';
import { HaToggle } from '@/components/ha-toggle';

export interface UserDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  user: UserDTO | null;
  authorities: AuthorityDTO[];
  onClose: () => void;
  onSuccess: () => void;
}

const KNOWN_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
  'ROLE_USER',
  'ROLE_READ_ONLY',
];

export function UserDrawer({
  isOpen,
  mode,
  user,
  authorities,
  onClose,
  onSuccess,
}: UserDrawerProps): JSX.Element {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<UserFormData>({
    login: '',
    email: '',
    firstName: '',
    lastName: '',
    authorities: ['ROLE_USER'],
    activated: true,
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<UserFormErrors>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form when user changes
  useEffect(() => {
    if (mode === 'edit' && user) {
      setFormData({
        login: user.login,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        authorities: user.authorities.length > 0 ? user.authorities : ['ROLE_USER'],
        activated: user.activated,
        password: '',
        confirmPassword: '',
      });
    } else if (mode === 'create') {
      setFormData({
        login: '',
        email: '',
        firstName: '',
        lastName: '',
        authorities: ['ROLE_USER'],
        activated: true,
        password: '',
        confirmPassword: '',
      });
    }
    setErrors({});
  }, [mode, user]);

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
    },
    onError: (error: Error) => {
      setErrors({ email: error.message });
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: (data: { login: string; formData: UserFormData }) =>
      updateUser(data.login, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
    },
    onError: (error: Error) => {
      setErrors({ email: error.message });
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
    },
    onError: (error: Error) => {
      setErrors({ login: error.message });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: UserFormErrors = {};

    // Login validation
    if (!formData.login.trim()) {
      newErrors.login = 'This field is required.';
    } else if (!/^[a-z0-9._-]+$/.test(formData.login)) {
      newErrors.login = 'Login must be lowercase alphanumeric with _, -, or . characters.';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'This field is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Enter a valid email address.';
    }

    // Authorities validation
    if (formData.authorities.length === 0) {
      newErrors.authorities = 'This field is required.';
    }

    // Password validation (create mode only)
    if (mode === 'create') {
      if (!formData.password) {
        newErrors.password = 'This field is required.';
      } else if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters.';
      }

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    if (mode === 'create') {
      createMutation.mutate(formData);
    } else if (user) {
      updateMutation.mutate({ login: user.login, formData });
    }
  };

  const handleDelete = () => {
    if (user) {
      deleteMutation.mutate(user.login);
    }
  };

  const handleChange = (field: keyof UserFormData, value: string | boolean | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if ((errors as Record<string, string | undefined>)[field as string]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Filter authorities to known roles
  const selectableRoles = authorities.filter((auth) => KNOWN_ROLES.includes(auth.name));

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isFormValid = Object.keys(errors).length === 0;

  return (
    <>
      <HaDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={mode === 'create' ? 'Add User' : user?.login ?? ''}
        subtitle={mode === 'create' ? 'Create a new platform user account.' : user?.email ?? ''}
        width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <HaButton
                variant="primary"
                onClick={handleSubmit}
                isDisabled={isPending || !isFormValid}
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                {mode === 'create' ? 'Save' : 'Save Changes'}
              </HaButton>
              <HaButton variant="secondary" onClick={onClose} isDisabled={isPending}>
                Cancel
              </HaButton>
            </div>
            {mode === 'edit' && (
              <HaButton
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                isDisabled={isPending}
              >
                Deactivate
              </HaButton>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Login */}
          <HaFormGroup
            label="Login"
            isRequired
            fieldId="field-login"
          >
            {mode === 'edit' ? (
              <div
                style={{
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-base)',
                  color: 'var(--ha-text-primary)',
                  padding: '8px 12px',
                  background: 'var(--ha-surface-primary)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                }}
              >
                {formData.login}
              </div>
            ) : (
              <HaTextInput
                id="field-login"
                aria-label="Login"
                value={formData.login}
                onChange={(value) => handleChange('login', value)}
                isRequired
                validated={errors.login ? 'error' : 'default'}
              />
            )}
          </HaFormGroup>

          {/* Email */}
          <HaFormGroup
            label="Email"
            isRequired
            fieldId="field-email"
          >
            <HaTextInput
              id="field-email"
              aria-label="Email"
              type="email"
              value={formData.email}
              onChange={(value) => handleChange('email', value)}
              isRequired
              validated={errors.email ? 'error' : 'default'}
            />
          </HaFormGroup>

          {/* First Name */}
          <HaFormGroup label="First Name">
            <HaTextInput
              id="field-firstName"
              aria-label="First name"
              value={formData.firstName}
              onChange={(value) => handleChange('firstName', value)}
            />
          </HaFormGroup>

          {/* Last Name */}
          <HaFormGroup label="Last Name">
            <HaTextInput
              id="field-lastName"
              aria-label="Last name"
              value={formData.lastName}
              onChange={(value) => handleChange('lastName', value)}
            />
          </HaFormGroup>

          {/* Role */}
          <HaFormGroup
            label="Role"
            isRequired
            fieldId="field-authorities"
          >
            <HaSelect
              id="field-authorities"
              ariaLabel="Role"
              value={formData.authorities[0] ?? ''}
              onChange={(value) => handleChange('authorities', [value])}
              placeholder="Select a role"
              options={selectableRoles.map((auth) => ({ value: auth.name, label: auth.name }))}
            />
          </HaFormGroup>

          {/* Password (create mode only) */}
          {mode === 'create' && (
            <>
              <HaFormGroup
                label="Password"
                isRequired
                fieldId="field-password"
              >
                <HaTextInput
                  id="field-password"
                  aria-label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(value) => handleChange('password', value)}
                  isRequired
                  validated={errors.password ? 'error' : 'default'}
                  autoComplete="new-password"
                />
              </HaFormGroup>

              <HaFormGroup
                label="Confirm Password"
                isRequired
                fieldId="field-confirmPassword"
              >
                <HaTextInput
                  id="field-confirmPassword"
                  aria-label="Confirm password"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(value) => handleChange('confirmPassword', value)}
                  isRequired
                  validated={errors.confirmPassword ? 'error' : 'default'}
                  autoComplete="new-password"
                />
              </HaFormGroup>
            </>
          )}

          {/* Activated */}
          <HaFormGroup label="Activated">
            <HaToggle
              isChecked={formData.activated}
              onChange={(checked) => handleChange('activated', checked)}
              aria-label="User activated"
            />
          </HaFormGroup>
        </div>
      </HaDrawer>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--ha-scrim)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            style={{
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-md)',
              padding: 24,
              maxWidth: 480,
              boxShadow: 'var(--ha-shadow-control)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 'var(--ha-text-lg)', fontWeight: 600, color: 'var(--ha-text-primary)', margin: 0 }}>
              Deactivate {user?.login}?
            </h2>
            <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)', marginTop: 8 }}>
              The user will no longer be able to log in. This does not delete the user&apos;s data.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <HaButton variant="secondary" onClick={() => setShowDeleteConfirm(false)} isDisabled={isPending}>
                Cancel
              </HaButton>
              <HaButton
                variant="danger"
                onClick={() => {
                  handleDelete();
                  setShowDeleteConfirm(false);
                }}
                isLoading={deleteMutation.isPending}
                isDisabled={isPending}
              >
                Deactivate
              </HaButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
