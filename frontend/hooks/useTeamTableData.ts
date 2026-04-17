import { useQuery } from '@tanstack/react-query';
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
    queryFn: async (): Promise<TeamTableApiResponse> => {
      const response = await api.get<TeamTableApiResponse>(
        `/dashboard/team-table?lang=${locale}&date_range=${dateRange}`
      );
      return response.data;
    },
  });
}
