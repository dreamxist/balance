import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const sampleData = [
  { month: 'Ene', patrimonio: 4200000 },
  { month: 'Feb', patrimonio: 4350000 },
  { month: 'Mar', patrimonio: 4100000 },
  { month: 'Abr', patrimonio: 4500000 },
  { month: 'May', patrimonio: 4800000 },
  { month: 'Jun', patrimonio: 5100000 },
]

export function RechartsSmokeTest() {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sampleData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="patrimonio"
            stroke="oklch(0.6 0.2 145)"
            fill="oklch(0.6 0.2 145 / 0.2)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
