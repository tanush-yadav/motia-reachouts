'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'

export function JobSearchForm() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a search query',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/job-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit job search')
      }

      const data = await response.json()

      toast({
        title: 'Success',
        description: 'Job search submitted successfully!',
      })

      // Reset form
      setQuery('')
    } catch (error) {
      console.error('Error submitting job search:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit job search. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Start a New Job Search</CardTitle>
        <CardDescription>
          Enter a natural language query to search for jobs. For example, "Find software engineering jobs at YC startups in San Francisco."
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <Textarea
            placeholder="Enter your job search query..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-32 resize-none"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={isLoading || !query.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              'Search Jobs'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}