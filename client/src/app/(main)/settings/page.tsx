'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SettingsPage() {
  return (
    <div className="container">
      <div className="flex flex-col py-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground mb-8">Manage your application settings.</p>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Update your basic account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Your email address" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="apiKey">API Key</Label>
              <Input id="apiKey" type="password" placeholder="Your API Key" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}