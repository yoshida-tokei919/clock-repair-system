import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, Clock, ArrowDown } from "lucide-react";

interface TimelineEvent {
    id: number;
    status: string;
    date: string;
    note?: string;
    isCompleted: boolean;
}

interface RepairTimelineProps {
    events: TimelineEvent[];
}

export function RepairTimeline({ events }: RepairTimelineProps) {
    return (
        <div className="relative space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
            {events.map((event, index) => (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">

                    {/* Icon */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {event.isCompleted ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <Circle className="w-4 h-4 text-slate-400 group-last:text-blue-500 group-last:fill-blue-500" />
                        )}
                    </div>

                    {/* Content Card */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                            <div className="font-bold text-slate-900">{event.status}</div>
                            <time className="font-caveat font-medium text-indigo-500 text-xs">
                                {event.date}
                            </time>
                        </div>
                        {event.note && (
                            <div className="text-slate-500 text-sm">
                                {event.note}
                            </div>
                        )}
                        {index === events.length - 1 && !event.isCompleted && (
                            <Badge variant="secondary" className="mt-2 text-xs bg-blue-100 text-blue-800">
                                現在の工程
                            </Badge>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
