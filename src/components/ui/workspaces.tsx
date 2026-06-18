"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface Workspace {
  id: string
  name: string
  logo?: string
  plan?: string
  meta?: string
}

interface WorkspaceContextValue<T extends Workspace> {
  open: boolean
  setOpen: (open: boolean) => void
  selectedWorkspace: T | undefined
  workspaces: T[]
  onWorkspaceSelect: (workspace: T) => void
  getWorkspaceId: (workspace: T) => string
  getWorkspaceName: (workspace: T) => string
}

const WorkspaceContext = React.createContext<WorkspaceContextValue<Workspace> | null>(null)

function useWorkspaceContext<T extends Workspace>() {
  const context = React.useContext(WorkspaceContext) as WorkspaceContextValue<T> | null
  if (!context) {
    throw new Error("Workspace components must be used within Workspaces")
  }
  return context
}

interface WorkspaceProviderProps<T extends Workspace> {
  children: React.ReactNode
  workspaces: T[]
  selectedWorkspaceId?: string
  onWorkspaceChange?: (workspace: T) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  getWorkspaceId?: (workspace: T) => string
  getWorkspaceName?: (workspace: T) => string
}

function Workspaces<T extends Workspace>({
  children,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  open: controlledOpen,
  onOpenChange,
  getWorkspaceId = (workspace) => workspace.id,
  getWorkspaceName = (workspace) => workspace.name,
}: WorkspaceProviderProps<T>) {
  const [internalOpen, setInternalOpen] = React.useState(false)

  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const selectedWorkspace = React.useMemo(() => {
    if (!workspaces.length) return undefined
    if (!selectedWorkspaceId) return workspaces[0]
    return workspaces.find((workspace) => getWorkspaceId(workspace) === selectedWorkspaceId) ?? workspaces[0]
  }, [getWorkspaceId, selectedWorkspaceId, workspaces])

  const handleWorkspaceSelect = React.useCallback(
    (workspace: T) => {
      onWorkspaceChange?.(workspace)
      setOpen(false)
    },
    [onWorkspaceChange, setOpen],
  )

  const value: WorkspaceContextValue<T> = {
    getWorkspaceId,
    getWorkspaceName,
    onWorkspaceSelect: handleWorkspaceSelect,
    open,
    selectedWorkspace,
    setOpen,
    workspaces,
  }

  return (
    <WorkspaceContext.Provider value={value as unknown as WorkspaceContextValue<Workspace>}>
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </WorkspaceContext.Provider>
  )
}

interface WorkspaceTriggerProps extends React.ComponentProps<"button"> {
  collapsed?: boolean
  renderTrigger?: (workspace: Workspace, isOpen: boolean) => React.ReactNode
}

function WorkspaceTrigger({
  className,
  collapsed = false,
  renderTrigger,
  ...props
}: WorkspaceTriggerProps) {
  const { getWorkspaceName, open, selectedWorkspace } = useWorkspaceContext()

  if (!selectedWorkspace) return null

  if (renderTrigger) {
    return (
      <PopoverTrigger asChild>
        <button className={className} {...props}>
          {renderTrigger(selectedWorkspace, open)}
        </button>
      </PopoverTrigger>
    )
  }

  const name = getWorkspaceName(selectedWorkspace)

  return (
    <PopoverTrigger asChild>
      <button
        data-state={open ? "open" : "closed"}
        className={cn(
          "group flex w-full items-center rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] text-left text-sm transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px",
          collapsed ? "mx-auto size-10 justify-center p-0" : "min-h-11 justify-between gap-2 px-2.5 py-2",
          className,
        )}
        {...props}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <WorkspaceAvatar name={name} logo={selectedWorkspace.logo} />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[var(--text-primary)]">{name}</span>
              {selectedWorkspace.plan ? (
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{selectedWorkspace.plan}</span>
              ) : null}
            </span>
          ) : null}
        </span>
        {!collapsed ? <ChevronsUpDownIcon aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)]" /> : null}
      </button>
    </PopoverTrigger>
  )
}

interface WorkspaceContentProps extends React.ComponentProps<typeof PopoverContent> {
  renderWorkspace?: (workspace: Workspace, isSelected: boolean) => React.ReactNode
  title?: string
  searchable?: boolean
  onSearch?: (query: string) => void
}

function WorkspaceContent({
  className,
  children,
  renderWorkspace,
  title = "Workspaces",
  searchable = false,
  onSearch,
  ...props
}: WorkspaceContentProps) {
  const { getWorkspaceId, getWorkspaceName, onWorkspaceSelect, selectedWorkspace, workspaces } = useWorkspaceContext()
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredWorkspaces = React.useMemo(() => {
    if (!searchQuery) return workspaces
    return workspaces.filter((workspace) => getWorkspaceName(workspace).toLowerCase().includes(searchQuery.toLowerCase()))
  }, [getWorkspaceName, searchQuery, workspaces])

  React.useEffect(() => {
    onSearch?.(searchQuery)
  }, [onSearch, searchQuery])

  return (
    <PopoverContent align="start" className={cn("w-72 p-0", className)} {...props}>
      <div className="border-b border-[var(--border-hairline)] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</p>
      </div>

      {searchable ? (
        <div className="border-b border-[var(--border-hairline)] px-3 py-2">
          <input
            type="text"
            placeholder="Search workspaces"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      ) : null}

      <div className="max-h-[300px] overflow-y-auto p-1.5">
        {filteredWorkspaces.length === 0 ? (
          <div className="px-3 py-5 text-center text-sm text-[var(--text-muted)]">No workspaces found</div>
        ) : (
          filteredWorkspaces.map((workspace) => {
            const isSelected = Boolean(selectedWorkspace && getWorkspaceId(selectedWorkspace) === getWorkspaceId(workspace))
            return (
              <button
                key={getWorkspaceId(workspace)}
                onClick={() => onWorkspaceSelect(workspace)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
                  isSelected && "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--text-primary)]",
                )}
              >
                {renderWorkspace ? renderWorkspace(workspace, isSelected) : <DefaultWorkspaceRow workspace={workspace} selected={isSelected} />}
              </button>
            )
          })
        )}
      </div>

      {children ? (
        <>
          <div className="border-t border-[var(--border-hairline)]" />
          <div className="p-1.5">{children}</div>
        </>
      ) : null}
    </PopoverContent>
  )
}

function DefaultWorkspaceRow({ selected, workspace }: { selected: boolean; workspace: Workspace }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <WorkspaceAvatar name={workspace.name} logo={workspace.logo} />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{workspace.name}</span>
        {workspace.plan ? <span className="block truncate text-xs text-[var(--text-muted)]">{workspace.plan}</span> : null}
      </div>
      {selected ? <CheckIcon aria-hidden className="ml-auto h-4 w-4 text-[var(--accent)]" /> : null}
    </div>
  )
}

function WorkspaceAvatar({ logo, name }: { logo?: string; name: string }) {
  return (
    <Avatar className="size-7 rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      {logo ? <AvatarImage alt="" src={logo} /> : null}
      <AvatarFallback className="rounded text-[11px]">{workspaceInitials(name)}</AvatarFallback>
    </Avatar>
  )
}

function workspaceInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "W"
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
}

export { Workspaces, WorkspaceTrigger, WorkspaceContent }
