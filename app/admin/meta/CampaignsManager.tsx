'use client';

import { useState } from 'react';
import { discoverCampaigns, registerCampaign, assignCampaign } from './actions';

export default function CampaignsManager({
    localAdAccountId,
    localClients,
    registeredCampaigns
}: {
    localAdAccountId: string;
    localClients: any[];
    registeredCampaigns: any[];
}) {
    const [discovering, setDiscovering] = useState(false);
    const [availableCampaigns, setAvailableCampaigns] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState<string | null>(null);
    const [assigning, setAssigning] = useState<string | null>(null);
    const [selectedClientIds, setSelectedClientIds] = useState<Record<string, string>>({});

    const handleDiscover = async () => {
        setDiscovering(true);
        setError(null);
        
        try {
            const result = await discoverCampaigns(localAdAccountId);
            if (result.success) {
                setAvailableCampaigns(result.campaigns || []);
            } else {
                setError(result.error || 'An error occurred during discovery.');
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setDiscovering(false);
        }
    };

    const handleRegister = async (metaCampaignId: string) => {
        setRegistering(metaCampaignId);
        setError(null);
        
        try {
            const result = await registerCampaign(metaCampaignId, localAdAccountId);
            if (result.success) {
                // Keep it in the available list so they can see it's now registered,
                // but the UI will change because it will now be in `registeredCampaigns`.
                // Actually, reloading the page via revalidatePath handles the state update nicely.
            } else {
                setError(result.error || 'An error occurred during registration.');
            }
        } catch (err) {
            setError('An unexpected error occurred while registering. Please try again.');
        } finally {
            setRegistering(null);
        }
    };

    const handleAssign = async (localCampaignId: string) => {
        const clientId = selectedClientIds[localCampaignId];
        if (!clientId) {
            setError('Please select a client to assign the campaign to.');
            return;
        }

        setAssigning(localCampaignId);
        setError(null);

        try {
            const result = await assignCampaign(localCampaignId, clientId);
            if (result.success) {
                // Success, state will refresh via revalidatePath
            } else {
                setError(result.error || 'An error occurred during assignment.');
            }
        } catch (err) {
            setError('An unexpected error occurred while assigning. Please try again.');
        } finally {
            setAssigning(null);
        }
    };

    const handleClientChange = (localCampaignId: string, clientId: string) => {
        setSelectedClientIds(prev => ({
            ...prev,
            [localCampaignId]: clientId
        }));
    };

    return (
        <div className="pt-2">
            {error && (
                <div className="mb-6 bg-red-50/50 backdrop-blur-sm border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                    <svg className="h-5 w-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <button
                onClick={handleDiscover}
                disabled={discovering}
                className="inline-flex items-center px-4 py-2 border border-purple-200 text-sm font-bold rounded-xl shadow-sm text-[#6F42C1] bg-purple-50 hover:bg-purple-100 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all disabled:opacity-50"
            >
                {discovering ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#6F42C1]" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Discovering Campaigns...
                    </>
                ) : 'Discover Campaigns'}
            </button>

            {availableCampaigns.length > 0 && (
                <div className="mt-6 relative z-0">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-100/50 to-indigo-50/50 rounded-xl transform -rotate-1 scale-[1.02] opacity-50 blur-sm -z-10"></div>
                    <div className="bg-white/80 backdrop-blur-md shadow-sm sm:rounded-xl border border-purple-100/50 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100/50">
                            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discovered Campaigns (Unregistered)</h5>
                        </div>
                        <ul role="list" className="divide-y divide-gray-100/50">
                            {availableCampaigns.map((campaign) => {
                                const isRegistered = registeredCampaigns.some(rc => rc.meta_campaign_id === campaign.meta_campaign_id);

                                return (
                                    <li key={campaign.meta_campaign_id} className="hover:bg-purple-50/20 transition-colors">
                                        <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-gray-900 truncate">{campaign.name}</p>
                                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                                        {campaign.meta_campaign_id}
                                                    </span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                        (campaign.effective_status || campaign.status) === 'ACTIVE' 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {campaign.effective_status || campaign.status}
                                                    </span>
                                                    {campaign.objective && (
                                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                            {campaign.objective.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 sm:mt-0 sm:ml-5 flex-shrink-0">
                                                {isRegistered ? (
                                                    <span className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-bold rounded-lg text-gray-500 bg-gray-100 shadow-inner">
                                                        Registered
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRegister(campaign.meta_campaign_id)}
                                                        disabled={registering === campaign.meta_campaign_id}
                                                        className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl shadow-sm text-white bg-gradient-to-r from-[#6F42C1] to-[#8a5ad9] hover:from-[#5a369e] hover:to-[#7648be] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                                    >
                                                        {registering === campaign.meta_campaign_id ? 'Adding...' : '+ Add to Marketivity'}
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

            {registeredCampaigns.length > 0 && (
                <div className="mt-8">
                    <h5 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        Tracked Campaigns
                    </h5>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <ul role="list" className="divide-y divide-gray-100">
                            {registeredCampaigns.map((campaign) => {
                                const isAssigned = campaign.campaign_assignments && campaign.campaign_assignments.length > 0;
                                const assignedClient = isAssigned ? campaign.campaign_assignments[0].clients : null;

                                return (
                                    <li key={campaign.id} className="hover:bg-gray-50/50 transition-colors">
                                        <div className="px-4 py-4 sm:px-5">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <p className="text-sm font-bold text-gray-900 truncate">{campaign.name}</p>
                                                        {isAssigned ? (
                                                            <span className="px-2.5 py-0.5 inline-flex text-[10px] uppercase tracking-wider font-bold rounded-full bg-green-50 text-green-700 border border-green-200">
                                                                Assigned
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-0.5 inline-flex text-[10px] uppercase tracking-wider font-bold rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 animate-pulse">
                                                                Action Required
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="mt-2 flex items-center text-xs text-gray-500">
                                                        <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                            {campaign.meta_campaign_id}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    {isAssigned ? (
                                                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                                            <div className="h-6 w-6 rounded bg-purple-100 text-[#6F42C1] flex items-center justify-center text-xs font-bold">
                                                                {assignedClient?.name?.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase leading-none">Client</span>
                                                                <span className="text-sm font-bold text-gray-900 leading-tight">{assignedClient?.name}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-yellow-50/50 rounded-xl border border-yellow-100">
                                                            {localClients.length > 0 ? (
                                                                <>
                                                                    <select
                                                                        value={selectedClientIds[campaign.id] || ''}
                                                                        onChange={(e) => handleClientChange(campaign.id, e.target.value)}
                                                                        className="block w-full sm:w-48 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-[#6F42C1] focus:border-[#6F42C1] rounded-lg bg-white shadow-sm font-medium"
                                                                    >
                                                                        <option value="" disabled>Select a client...</option>
                                                                        {localClients.map(client => (
                                                                            <option key={client.id} value={client.id}>{client.name}</option>
                                                                        ))}
                                                                    </select>
                                                                    <button
                                                                        onClick={() => handleAssign(campaign.id)}
                                                                        disabled={assigning === campaign.id || !selectedClientIds[campaign.id]}
                                                                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white bg-[#6F42C1] hover:bg-[#5a369e] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F42C1] disabled:opacity-50 transition-all"
                                                                    >
                                                                        {assigning === campaign.id ? (
                                                                            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                            </svg>
                                                                        ) : 'Assign'}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-xs font-medium text-red-500 italic px-2 py-1">No clients available in this organization.</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
