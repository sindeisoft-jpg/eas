"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronDown, Download, Filter, MoreHorizontal, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { translateColumnName } from "@/lib/utils"
import { formatNumber } from "@/lib/number-formatter"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchable?: boolean
  exportable?: boolean
  onExport?: (format: "csv" | "excel") => void
  defaultPageSize?: number
  className?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchable = true,
  exportable = true,
  onExport,
  defaultPageSize = 10,
  className = "",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const value = String(row.getValue(columnId) ?? "")
      return value.toLowerCase().includes(String(filterValue).toLowerCase())
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: defaultPageSize,
      },
    },
  })

  const handleExportCSV = () => {
    const headers = table.getVisibleFlatColumns().map((col) => col.id || col.columnDef.header?.toString() || "")
    const rows = table.getRowModel().rows.map((row) =>
      table.getVisibleFlatColumns().map((col) => {
        const value = row.getValue(col.id || "")
        return value !== null && value !== undefined ? String(value) : ""
      })
    )

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n")

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `data_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    if (onExport) {
      onExport("csv")
    }
  }

  const handleExportExcel = () => {
    // 简化版Excel导出（实际项目中可以使用xlsx库）
    handleExportCSV() // 暂时使用CSV格式
    if (onExport) {
      onExport("excel")
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        {searchable && (
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="搜索所有列..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-sm"
              aria-label="搜索表格数据"
              aria-describedby="search-description"
            />
            <span id="search-description" className="sr-only">
              在表格的所有列中搜索数据
            </span>
            {globalFilter && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setGlobalFilter("")}
                className="h-9 w-9"
                aria-label="清除搜索"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {exportable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  导出
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  导出为 CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <Download className="h-4 w-4 mr-2" />
                  导出为 Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                列
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>切换列显示</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {translateColumnName(column.id)}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 表格 */}
      <Card className="rounded-lg border border-border/50 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table role="table" aria-label="数据表格">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/30 border-b border-border/50">
                  {headerGroup.headers.map((header) => {
                    const sortDirection = header.column.getIsSorted()
                    return (
                      <TableHead 
                        key={header.id} 
                        className="text-left p-3 text-sm font-semibold text-foreground"
                        aria-sort={
                          sortDirection === "asc" ? "ascending" : 
                          sortDirection === "desc" ? "descending" : 
                          "none"
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : (
                            <button
                              className="flex items-center gap-1.5 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 rounded-md px-1 -mx-1"
                              onClick={header.column.getToggleSortingHandler()}
                              aria-label={`按${flexRender(header.column.columnDef.header, header.getContext())}排序`}
                              aria-pressed={sortDirection ? "true" : "false"}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {header.column.getCanSort() && (
                                <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="border-b border-border/30 transition-colors hover:bg-muted/30"
                    role="row"
                    aria-rowindex={index + 2}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell 
                        key={cell.id} 
                        className="p-3 text-sm text-foreground"
                        role="gridcell"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                    role="gridcell"
                    aria-colspan={columns.length}
                  >
                    <span role="status" aria-live="polite">没有找到数据</span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页控制 */}
        <nav 
          className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/20"
          aria-label="表格分页"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-live="polite" aria-atomic="true">
              显示 {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} -{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{" "}
              条，共 {table.getFilteredRowModel().rows.length} 条
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">每页显示:</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50, 100].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-8 w-8 p-0"
                aria-label="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">上一页</span>
              </Button>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  第 {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} 页
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-8 w-8 p-0"
                aria-label="下一页"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">下一页</span>
              </Button>
            </div>
          </div>
        </nav>
      </Card>
    </div>
  )
}

// 辅助函数：从QueryResult创建列定义
export function createColumnsFromQueryResult(columns: string[]): ColumnDef<any>[] {
  return columns.map((col) => ({
    accessorKey: col,
    header: translateColumnName(col),
    cell: ({ row }) => {
      const value = row.getValue(col)
      if (value === null || value === undefined) {
        return <span className="text-muted-foreground">-</span>
      }
      if (typeof value === "number") {
        return (
          <span className="font-medium text-foreground">
            {formatNumber(value, { showOriginal: value >= 10000 })}
          </span>
        )
      }
      return <span className="text-foreground/90">{String(value)}</span>
    },
    enableSorting: true,
    enableHiding: true,
  }))
}
