import type { AttributionResult, BacktestPoint, Snapshot } from '../../../types'
import { ReviewComparisonPanel } from './reviewComparisonPanel'
import { AttributionPanel, BacktestPanel } from './reviewMetricsPanels'
import { ReviewSnapshotsPanel } from './reviewSnapshotsPanel'

type ReviewViewProps = {
  snapshots: Snapshot[]
  compareA?: Snapshot
  compareB?: Snapshot
  compareAId: string
  compareBId: string
  backtestSeries: BacktestPoint[]
  attribution: AttributionResult | null
  backtestMax: number
  attributionMax: number
  onAddSnapshotTags: (id: string, tags: string[]) => void
  onSetSnapshotTags: (id: string, tags: string[]) => void
  onDeleteSnapshot: (id: string) => void
  onCompareAIdChange: (id: string) => void
  onCompareBIdChange: (id: string) => void
}

export function ReviewView(props: ReviewViewProps) {
  return (
    <main className="layout review-layout">
      <ReviewSnapshotsPanel
        snapshots={props.snapshots}
        onAddSnapshotTags={props.onAddSnapshotTags}
        onSetSnapshotTags={props.onSetSnapshotTags}
        onDeleteSnapshot={props.onDeleteSnapshot}
      />

      <ReviewComparisonPanel
        snapshots={props.snapshots}
        compareA={props.compareA}
        compareB={props.compareB}
        compareAId={props.compareAId}
        compareBId={props.compareBId}
        onCompareAIdChange={props.onCompareAIdChange}
        onCompareBIdChange={props.onCompareBIdChange}
      />

      <BacktestPanel backtestSeries={props.backtestSeries} backtestMax={props.backtestMax} />

      <AttributionPanel attribution={props.attribution} attributionMax={props.attributionMax} />
    </main>
  )
}
