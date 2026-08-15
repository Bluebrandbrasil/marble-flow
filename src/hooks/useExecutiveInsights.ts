import { useMemo } from 'react';
import type { ExecutiveDashboardData } from './useExecutiveDashboard';

export interface ExecutiveInsight {
    type: 'growth' | 'opportunity' | 'risk' | 'performance';
    message: string;
    description: string;
    severity: 'info' | 'success' | 'warning' | 'critical';
}

export const useExecutiveInsights = (data: ExecutiveDashboardData) => {
    const insights = useMemo(() => {
        const list: ExecutiveInsight[] = [];
        if (data.isLoading) return list;

        const { summary, geoData, originData, stoneData, influencerData } = data;

        // 1. PERFORMANCE INSIGHTS
        const topOrigin = originData[0];
        if (topOrigin && topOrigin.revenue > 0) {
            const revenueShare = (topOrigin.revenue / summary.totalRevenue) * 100;
            list.push({
                type: 'performance',
                message: `${topOrigin.name} lidera com ${revenueShare.toFixed(1)}% do faturamento`,
                description: `O canal ${topOrigin.name} mantém-se como a principal fonte de receita comercial.`,
                severity: 'info'
            });
        }

        const topStone = stoneData[0];
        if (topStone && topStone.revenue > 0) {
            list.push({
                type: 'performance',
                message: `${topStone.name} é o material mais rentável`,
                description: `Material gerou ${topStone.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no período atual.`,
                severity: 'info'
            });
        }

        // 2. GROWTH & RISK INSIGHTS (using Deltas)
        if (summary.deltas.revenue > 10) {
            list.push({
                type: 'growth',
                message: `Faturamento em expansão acelerada (+${summary.deltas.revenue.toFixed(1)}%)`,
                description: `O volume financeiro cresceu significativamente em comparação ao período anterior.`,
                severity: 'success'
            });
        } else if (summary.deltas.revenue < -5) {
            list.push({
                type: 'risk',
                message: `Alerta de queda no faturamento (${summary.deltas.revenue.toFixed(1)}%)`,
                description: `Houve um recuo financeiro. Recomenda-se revisar a entrada de novos orçamentos.`,
                severity: 'critical'
            });
        }

        if (summary.deltas.conversion < -3) {
            list.push({
                type: 'risk',
                message: `Queda na eficiência do comercial`,
                description: `A conversão de leads em vendas caiu ${Math.abs(summary.deltas.conversion).toFixed(1)}%.`,
                severity: 'warning'
            });
        }

        // 3. OPPORTUNITY INSIGHTS
        // City with high ticket but low volume
        const avgGlobalTicket = summary.avgTicket;
        const potentialCity = geoData.find(g => g.avgTicket > avgGlobalTicket * 1.3 && g.orders <= 2);
        if (potentialCity) {
            list.push({
                type: 'opportunity',
                message: `Expansão Oportuna: ${potentialCity.city}`,
                description: `Ticket médio elevado (${potentialCity.avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}), mas com baixo volume de pedidos. Potencial subexplorado.`,
                severity: 'success'
            });
        }

        // Origin with high conversion but low revenue
        const highConvOrigin = originData.find(o => o.conversion > 40 && o.revenue < summary.totalRevenue * 0.1);
        if (highConvOrigin) {
            list.push({
                type: 'opportunity',
                message: `Escalar canal ${highConvOrigin.name}`,
                description: `Eficiência de conversão excepcional (${highConvOrigin.conversion.toFixed(1)}%), mas volume financeiro ainda baixo.`,
                severity: 'success'
            });
        }

        // 4. INFLUENCER INSIGHTS
        const lowConvInf = influencerData.find(i => i.leads > 5 && i.conversion < 10);
        if (lowConvInf) {
            list.push({
                type: 'risk',
                message: `Revisar abordagem com ${lowConvInf.name}`,
                description: `O parceiro gerou ${lowConvInf.leads} leads, mas a taxa de fechamento está abaixo de 10%.`,
                severity: 'warning'
            });
        }

        return list.slice(0, 4); // Limit to top 4 insights
    }, [data]);

    return { insights };
};
