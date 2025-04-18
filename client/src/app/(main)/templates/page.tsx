'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Placeholder Template List component
function TemplateList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Templates</CardTitle>
        <CardDescription>Manage your email templates here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Template list will appear here.</p>
        <Button className="mt-4">Create New Template</Button>
      </CardContent>
    </Card>
  )
}

export default function TemplatesPage() {
  return (
    <div className="container">
      <div className="flex flex-col py-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Templates</h1>
        <p className="text-muted-foreground mb-8">Manage your email templates.</p>
        <TemplateList />
      </div>
    </div>
  )
}