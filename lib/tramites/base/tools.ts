export type ToolContext = {
  state_meta?: any
  transition_info?: any
  context_diff?: any
}

export type ToolDefinition = {
  id: string
  commandType: string
  description: string
  allowedStates: string[]
  inputSchema: Record<string, any>
  outputSchema: Record<string, any>
}
