export type RepairPartsOrderStatus = 'pending' | 'ordered' | 'received'

export function getRepairStatusFromOrderStatuses(
    statuses: RepairPartsOrderStatus[]
): '部品待ち(未注文)' | '部品待ち(注文済み)' | '部品入荷済み' | null {
    if (statuses.length === 0) return null
    if (statuses.includes('pending')) return '部品待ち(未注文)'
    if (statuses.includes('ordered')) return '部品待ち(注文済み)'
    return statuses.every(status => status === 'received') ? '部品入荷済み' : null
}
