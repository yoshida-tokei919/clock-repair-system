"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Globe, ShieldAlert, Check, Construction } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { updateRepairPublicStatus } from "@/actions/repair-actions";
import { useToast } from "@/components/ui/use-toast";

interface PublishCaseButtonProps {
    repairId: number;
    initialB2C: boolean;
    initialB2B: boolean;
}

export function PublishCaseButton({ repairId, initialB2C, initialB2B }: PublishCaseButtonProps) {
    const [isB2C, setIsB2C] = useState(initialB2C);
    const [isB2B, setIsB2B] = useState(initialB2B);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleSave = async (b2c: boolean, b2b: boolean) => {
        setIsLoading(true);
        // This action needs to be implemented
        const result = await updateRepairPublicStatus(repairId, b2c, b2b);
        setIsLoading(false);

        if (result.success) {
            setIsB2C(b2c);
            setIsB2B(b2b);
            toast({ title: "公開設定を更新しました", description: "Webサイトに変更が反映されます。" });
        } else {
            toast({ title: "エラー", description: "更新に失敗しました。", variant: "destructive" });
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Globe className="w-4 h-4" />
                    事例公開
                    {(isB2C || isB2B) && (
                        <span className="flex h-2 w-2 rounded-full bg-green-500" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">公開設定 (SEO)</h4>
                        <p className="text-sm text-muted-foreground">
                            修理事例としてWebサイトに公開します。
                            個人情報は自動的に隠されます。
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <div
                            className={`flex items-start space-x-4 rounded-md p-2 transition-all cursor-pointer border ${isB2C ? 'bg-accent border-accent-foreground/50' : 'hover:bg-accent hover:text-accent-foreground'}`}
                            onClick={() => handleSave(!isB2C, isB2B)}
                        >
                            <div className="mt-1">
                                {isB2C ? <Check className="h-5 w-5 text-green-600" /> : <div className="h-5 w-5 rounded border border-zinc-300" />}
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">B2C向けギャラリー</p>
                                <p className="text-xs text-muted-foreground">
                                    写真・作業内容のみ。価格は表示しません。
                                    <Badge variant="outline" className="ml-1 text-[10px]">Gallery</Badge>
                                </p>
                            </div>
                        </div>

                        <div
                            className={`flex items-start space-x-4 rounded-md p-2 transition-all cursor-pointer border ${isB2B ? 'bg-accent border-accent-foreground/50' : 'hover:bg-accent hover:text-accent-foreground'}`}
                            onClick={() => handleSave(isB2C, !isB2B)}
                        >
                            <div className="mt-1">
                                {isB2B ? <Check className="h-5 w-5 text-green-600" /> : <div className="h-5 w-5 rounded border border-zinc-300" />}
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">B2B向け事例紹介</p>
                                <p className="text-xs text-muted-foreground">
                                    価格・納期を表示します。業者様の参考用。
                                    <Badge variant="outline" className="ml-1 text-[10px]">Biz</Badge>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
