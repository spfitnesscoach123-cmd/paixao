import { useQuery, keepPreviousData } from '@tanstack/react-query';
import api from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import type { TeamTableRowData } from '../components/dashboard/types';

interface TeamTableApiResponse {
  rows: TeamTableRowData[];
  period_label: string;
}

export function useTeamTableData(
  dateRange: string = '7d',
  sessionName?: string | null,
  periodName?: string | null,
) {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['team-table', dateRange, locale, sessionName || '', periodName || ''],
    queryFn: async ({ signal }): Promise<TeamTableApiResponse> => {
      // Forward React Query's AbortSignal to axios so stale in-flight
      // requests are cancelled when dateRange changes rapidly.
      const params = new URLSearchParams({ lang: locale, date_range: dateRange });
      if (sessionName) params.set('session_name', sessionName);
      if (periodName) params.set('period_name', periodName);
      const response = await api.get<TeamTableApiResponse>(
        `/dashboard/team-table?${params.toString()}`,
        { signal }
      );
      return response.data;
    },
    // Keep prior rows visible while the new date range is fetching.
    // Prevents the isLoading branch from unmounting SVG chart subtrees
    // (RNSVGSvgView) and FlashList cells — the root of the native crash.
    placeholderData: keepPreviousData,
  });
}
