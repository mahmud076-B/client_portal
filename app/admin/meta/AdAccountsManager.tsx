'use client';

import { useState } from 'react';
import { discoverAdAccounts, registerAdAccount } from './actions';
import CampaignsManager from './CampaignsManager';

export default function AdAccountsManager({ 
    registeredAccounts = [],
    localClients = [],
    allRegisteredCampaigns = []
}: { 
    registeredAccounts: any[];
    localClients: any[];
    allRegisteredCampaigns: any[];
}) {
    const [discovering, setDiscovering] = useState(false);
    const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState<string | null>(null);

    const handleDiscover = async () => {
        setDiscovering(true);
        setError(null);
        
        try {
            const result = await discoverAdAccounts();
            if (result.success) {
                setAvailableAccounts(result.accounts || []);
            } else {
                setError(result.error || 'An error occurred during discovery.');
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setDiscovering(false);
        }
    };

    const handleRegister = async (accountId: string) => {
        setRegistering(accountId);
        setError(null);
        
        try {
            const result = await registerAdAccount(accountId);
            if (result.success) {
                // Remove from available list upon success so it doesn't clutter UI
                setAvailableAccounts((prev) => prev.filter(acc => acc.id !== accountId));
            } else {
                setError(result.error || 'An error occurred during registration.');
            }
        } catch (err) {
            setError('An unexpected error occurred while registering. Please try again.');
        } finally {
            setRegistering(null);
        }
    };

    return (
        <div className="mt-8 space-y-10 px-2 sm:px-4">
            <div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Ad Accounts Directory</h3>
                <p className="mt-1 text-sm text-gray-500">
                    Discover and manage the Meta Ad Accounts synchronized with your Marketivity organization.
                </p>
                <div className="mt-6 flex">
                    <button
                        onClick={handleDiscover}
                        disabled={discovering}
                        className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-xl shadow-md text-white bg-gradient-to-r from-[#6F42C1] to-[#8a5ad9] hover:from-[#5a369e] hover:to-[#7648be] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {discovering ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Scanning Meta...
                            </>
                        ) : 'Scan for Ad Accounts'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50/50 backdrop-blur-sm border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                    <svg className="h-5 w-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            {availableAccounts.length > 0 && (
                <div className="relative z-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-100 to-indigo-50 rounded-2xl transform -rotate-1 scale-105 opacity-50 blur-sm -z-10"></div>
                    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-purple-100/50 shadow-sm overflow-hidden z-10">
                        <div className="px-6 py-4 bg-white/50 border-b border-gray-100/50">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Discovered Accounts (Unregistered)</h4>
                        </div>
                        <ul role="list" className="divide-y divide-gray-100/50">
                            {availableAccounts.map((account) => {
                                const isAlreadyRegistered = registeredAccounts.some(reg => reg.meta_ad_account_id === account.id);

                                return (
                                    <li key={account.id} className="hover:bg-purple-50/30 transition-colors">
                                        <div className="px-6 py-5 flex items-center sm:justify-between">
                                            <div className="min-w-0 flex-1 sm:flex sm:items-center">
                                                <div>
                                                    <p className="text-base font-bold text-[#6F42C1] truncate">{account.name}</p>
                                                    <div className="mt-2 flex items-center gap-4 text-xs">
                                                        <span className="font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                                            {account.id}
                                                        </span>
                                                        <span className="text-gray-500 font-medium flex items-center gap-1">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                            {account.currency || 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="ml-5 flex-shrink-0">
                                                {isAlreadyRegistered ? (
                                                    <span className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-bold rounded-lg text-gray-500 bg-gray-100/80 shadow-inner">
                                                        Registered
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRegister(account.id)}
                                                        disabled={registering === account.id}
                                                        className="inline-flex items-center px-4 py-2 text-sm font-bold rounded-xl text-[#6F42C1] bg-purple-50 hover:bg-purple-100 border border-purple-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all disabled:opacity-50"
                                                    >
                                                        {registering === account.id ? 'Adding...' : '+ Add Account'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-gray-200/60">
                <div className="flex items-center justify-between mb-6">
                    <h4 className="text-xl font-extrabold text-gray-900 tracking-tight">Active Registrations</h4>
                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{registeredAccounts.length} Accounts</span>
                </div>
                {registeredAccounts.length > 0 ? (
                    <div className="space-y-6">
                        {registeredAccounts.map((account) => {
                            const accountCampaigns = allRegisteredCampaigns.filter(c => c.ad_account_id === account.id);
                            
                            return (
                                <div key={account.id} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="px-6 py-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-purple-100 text-[#6F42C1] flex items-center justify-center font-bold">
                                                        {account.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <p className="text-lg font-bold text-gray-900 truncate">{account.name}</p>
                                                </div>
                                                <div className="mt-3 flex items-center gap-4 text-xs font-medium text-gray-500">
                                                    <span className="bg-white border border-gray-200 px-2 py-0.5 rounded shadow-sm font-mono text-gray-600">
                                                        ID: {account.meta_ad_account_id}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                                                        {account.status.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white px-6 py-5">
                                        {/* Campaigns Manager for this Ad Account */}
                                        <CampaignsManager 
                                            localAdAccountId={account.id}
                                            localClients={localClients}
                                            registeredCampaigns={accountCampaigns}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No Ad Accounts Registered</h3>
                        <p className="mt-1 text-sm text-gray-500">Scan Meta and add an account above to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
