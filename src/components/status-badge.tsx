import { Badge } from "@/components/ui/badge";

export const getStatusBadge = (status: string) => {
    switch (status) {
        case 'reception': return <Badge className="bg-blue-500 hover:bg-blue-600">受付 (Reception)</Badge>;
        case 'diagnosing': return <Badge className="bg-orange-500 hover:bg-orange-600">見積中 (Estimating)</Badge>;
        case 'parts_wait': return <Badge className="bg-yellow-500 hover:bg-yellow-600">部品待 (Waiting Parts)</Badge>;
        case 'in_progress': return <Badge className="bg-purple-500 hover:bg-purple-600">作業中 (In Progress)</Badge>;
        case 'completed': return <Badge className="bg-green-500 hover:bg-green-600">完了 (Completed)</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
};
