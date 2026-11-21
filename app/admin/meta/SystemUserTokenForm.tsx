'use client';

import { useActionState } from 'react';
import { saveSystemUserToken, type SystemTokenState } from './actions';

export default function SystemUserTokenForm() {
    const [state, formAction, pending] = useActionState<SystemTokenState, FormData>(saveSystemUserToken, null);

    return (
        <details className="group">
            <summary className="cursor-pointer select-none px-6 py-4 sm:px-8 text-sm font-semibold text-gray-700 hover:text-[#6F42C1]">
                Use a System User token (never expires)
            </summary>
            <form action={formAction} className="px-6 pb-6 sm:px-8 space-y-3">
                <p className="text-sm text-gray-500">
                    In Meta Business Settings → Users → System users, generate a token for the portal app with
                    expiry <strong>Never</strong> and permissions <code>ads_read</code>, <code>ads_management</code>,{' '}
                    <code>business_management</code>. Paste it here. It is validated with Meta, then stored encrypted.
                </p>
                <input
                    type="password"
                    name="token"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    placeholder="EAAB..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#6F42C1]"
                />
                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={pending}
                        className="inline-flex items-center px-5 py-2.5 text-sm font-bold rounded-xl text-white bg-gradient-to-r from-[#6F42C1] to-[#8a5ad9] disabled:opacity-60"
                    >
                        {pending ? 'Validating…' : 'Save token'}
                    </button>
                    {state && (
                        <span className={`text-sm ${state.success ? 'text-green-700' : 'text-red-700'}`}>{state.message}</span>
                    )}
                </div>
            </form>
        </details>
    );
}
