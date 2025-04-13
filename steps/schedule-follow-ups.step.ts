export const config: StepConfig = {
  type: 'event',
  name: 'Schedule Follow Ups',
  description: 'Schedule follow ups for emails',
  subscribes: ['email.scheduled.sent'],
  emits: ['email.followup.scheduled', 'email.followup.error'],
  flows: ['job-search'],
}

export async function handler(args: any, ctx: any) {
  ctx.logger.info('Starting follow up scheduling process')
}
