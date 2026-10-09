export type Reviews = Record<string, string>
export interface Round { round: number; reviews: Reviews }
export interface Job {
  id: string
  title?: string
  branch?: string
  stage: string
  round?: number
  risk?: string | null
  complexity?: string | null
  reviews?: Reviews
  rounds?: Round[]
  files?: string[]
  blocker?: string
  dryRun?: boolean
  updatedAt?: string
}
export interface Board { version?: number; updatedAt?: string; jobs: Job[]; log?: unknown[] }
