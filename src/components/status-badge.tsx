import { Badge } from "@/components/ui/badge";

export const getStatusBadge = (status: string) => {
    switch (status) {
        case '受付':             return <Badge className="bg-blue-500 hover:bg-blue-600">受付</Badge>;
        case '見積中':           return <Badge className="bg-amber-500 hover:bg-amber-600">見積中</Badge>;
        case '承認待ち':         return <Badge className="bg-yellow-500 hover:bg-yellow-600">承認待ち</Badge>;
        case '部品待ち(未注文)': return <Badge className="bg-orange-400 hover:bg-orange-500">部品待ち(未注文)</Badge>;
        case '部品待ち(注文済み)': return <Badge className="bg-orange-600 hover:bg-orange-700">部品待ち(注文済み)</Badge>;
        case '部品入荷済み':     return <Badge className="bg-cyan-500 hover:bg-cyan-600">部品入荷済み</Badge>;
        case '作業待ち':         return <Badge className="bg-violet-400 hover:bg-violet-500">作業待ち</Badge>;
        case '作業中':           return <Badge className="bg-indigo-500 hover:bg-indigo-600">作業中</Badge>;
        case '作業完了':         return <Badge className="bg-emerald-500 hover:bg-emerald-600">作業完了</Badge>;
        case '納品済み':         return <Badge className="bg-zinc-500 hover:bg-zinc-600">納品済み</Badge>;
        case 'キャンセル':       return <Badge variant="destructive">キャンセル</Badge>;
        case '保留':             return <Badge className="bg-gray-400 hover:bg-gray-500">保留</Badge>;
        default:                 return <Badge variant="outline">{status}</Badge>;
    }
};
