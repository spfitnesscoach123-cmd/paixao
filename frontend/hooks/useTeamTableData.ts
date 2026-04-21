import { useQuery, keepPreviousData } from '@tanstack/react-query';
import api from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import type { TeamTableRowData } from '../components/dashboard/types';

interface TeamTableApiResponse {
  rows: TeamTableRowData[];
  period_label: string;
}

export function useTeamTableData(dateRange: string = '7d') {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['team-table', dateRange, locale],
    queryFn: async ({ signal }): Promise<TeamTableApiResponse> => {
      // Forward React Query's AbortSignal to axios so stale in-flight
      // requests are cancelled when dateRange changes rapidly.
      const response = await api.get<TeamTableApiResponse>(
        `/dashboard/team-table?lang=${locale}&date_range=${dateRange}`,
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
