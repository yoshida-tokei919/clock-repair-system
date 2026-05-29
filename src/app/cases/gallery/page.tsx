const repairCases = [
    {
        brand: "ROLEX",
        model: "Submariner",
        repair: "オーバーホール・部品交換",
        symptom: "止まり・精度不良",
        image: "/img/watch-submariner.jpg",
        note: "長期使用で油切れが見られたため、分解洗浄と消耗部品の確認を行う想定事例です。",
    },
    {
        brand: "ROLEX",
        model: "Sea-Dweller",
        repair: "オーバーホール・防水確認",
        symptom: "長期未整備",
        image: "/img/watch-sea-dweller.jpg",
        note: "防水まわりの状態を確認しながら、使用環境に合わせた整備を検討する想定事例です。",
    },
    {
        brand: "SEIKO",
        model: "Mechanical",
        repair: "分解掃除・精度調整",
        symptom: "進み・遅れ",
        image: "/img/watch1.jpg",
        note: "機械の状態を確認し、必要な洗浄・注油・調整を行う想定事例です。",
    },
    {
        brand: "CITIZEN",
        model: "Automatic",
        repair: "部品交換・調整",
        symptom: "止まり",
        image: "/img/watch2.jpg",
        note: "不具合箇所を確認し、部品交換の必要性を見極める想定事例です。",
    },
    {
        brand: "OMEGA",
        model: "Speedmaster",
        repair: "オーバーホール・部品交換",
        symptom: "精度不良",
        image: "/img/watch3.jpg",
        note: "内部状態と部品の摩耗を確認し、費用感とのバランスを見ながら整備する想定事例です。",
    },
];

export default function GalleryPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
            <div className="text-center mb-12">
                <p className="text-sm font-semibold tracking-[0.18em] text-blue-900 mb-3">
                    REPAIR CASES
                </p>
                <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight text-neutral-900">
                    修理事例ギャラリー
                </h1>
                <p className="text-neutral-500 leading-relaxed">
                    ブランドや症状から、実際の修理事例をご覧いただけます。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {repairCases.map((repairCase) => (
                    <article
                        key={`${repairCase.brand}-${repairCase.model}`}
                        className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                    >
                        <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                            <img
                                src={repairCase.image}
                                alt={`${repairCase.brand} ${repairCase.model} の修理事例イメージ`}
                                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                        </div>
                        <div className="p-5">
                            <div className="mb-3 flex flex-wrap gap-2">
                                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
                                    {repairCase.brand}
                                </span>
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                                    {repairCase.symptom}
                                </span>
                            </div>
                            <h2 className="mb-2 text-lg font-bold text-neutral-900">
                                {repairCase.model}
                            </h2>
                            <p className="mb-3 text-sm font-semibold text-blue-900">
                                {repairCase.repair}
                            </p>
                            <p className="text-sm leading-7 text-neutral-500">
                                {repairCase.note}
                            </p>
                        </div>
                    </article>
                ))}
            </div>

            <p className="mt-10 rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm leading-7 text-neutral-500">
                掲載している内容は一例です。時計の状態や部品の入手状況により、必要な作業内容は異なります。
            </p>
        </div>
    );
}
