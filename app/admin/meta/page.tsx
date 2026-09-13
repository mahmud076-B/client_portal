import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import AdAccountsManager from './AdAccountsManager';
import './meta-tailwind.css';

export default async function MetaAdminPage() {
    // Ensure only admins can access this page
    const { profile } = await requireAdmin();

    const supabase = await createClient();
    
    // Fetch connection status for this organization
    const { data: connection } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

    // Fetch already registered Ad Accounts for this organization
    const { data: registeredAccounts } = await supabase
        .from('ad_accounts')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

    // Fetch clients for this organization
    const { data: localClients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('organization_id', profile.organization_id)
        .order('name', { ascending: true });

    // Fetch all registered campaigns for this organization's ad accounts
    // We use a nested select to include the assignments (if any)
    const { data: allRegisteredCampaigns } = await supabase
        .from('campaigns')
        .select(`
            *,
            ad_accounts!inner(organization_id),
            campaign_assignments(clients(id, name))
        `)
        .eq('ad_accounts.organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Header Section */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4b2c82] via-[#6F42C1] to-[#9a67ea] shadow-xl p-8 sm:p-10 text-white">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div className="max-w-2xl">
                            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                                Meta Marketing API Integration
                            </h2>
                            <p className="text-purple-100 text-lg leading-relaxed">
                                Connect your Meta Business Manager to synchronize Ad Accounts, Campaigns, and Insights into the Marketivity Client Portal.
                            </p>
                        </div>
                        <div className="flex-shrink-0">
                            <div className="p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-inner flex items-center justify-center">
                                <svg className="h-12 w-12 text-white opacity-90 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Connection Status Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
                    <div className="px-6 py-6 sm:px-8">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                            <div className="flex items-start sm:items-center gap-5">
                                <div className={`flex-shrink-0 h-14 w-14 rounded-full flex items-center justify-center shadow-inner ${connection ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-200'}`}>
                                    {connection ? (
                                        <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">System Connection</h3>
                                    {connection ? (
                                        <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-1">
                                            <span className="inline-flex items-center text-sm font-semibold text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                                                <span className="h-1.5 w-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                                                Active Session
                                            </span>
                                            <span className="text-sm font-medium text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                ID: {connection.meta_user_id}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                Verified: {new Date(connection.last_validated_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="mt-1">
                                            <span className="inline-flex items-center text-sm font-medium text-gray-500">
                                                OAuth integration pending
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-shrink-0 flex gap-3">
                                {!connection ? (
                                    <a href="/api/meta/connect" className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-bold rounded-xl shadow-sm text-white bg-gradient-to-r from-[#6F42C1] to-[#8a5ad9] hover:from-[#5a369e] hover:to-[#7648be] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all transform hover:scale-105 active:scale-95">
                                        Connect Meta Account
                                    </a>
                                ) : (
                                    <>
                                        <a href="/api/meta/connect" className="inline-flex items-center px-5 py-2.5 border border-gray-300 shadow-sm text-sm font-semibold rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all">
                                            Reconnect
                                        </a>
                                        <form action="/api/meta/disconnect" method="POST">
                                            <button type="submit" className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-xl text-red-700 bg-red-50 hover:bg-red-100 border-red-100 hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all">
                                                Disconnect
                                            </button>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ad Accounts Manager Module */}
                {connection && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <AdAccountsManager 
                            registeredAccounts={registeredAccounts || []} 
                            localClients={localClients || []}
                            allRegisteredCampaigns={allRegisteredCampaigns || []}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
