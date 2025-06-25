import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meetingId = searchParams.get("meetingId")

    if (!meetingId) {
      return NextResponse.json({ success: false, error: "Meeting ID required" }, { status: 400 })
    }

    console.log("Getting pending approvals for meeting:", meetingId)

    // Get current meeting data from Permit.io
    try {
      const resourceInstance = await permit.api.resourceInstances.get(`web-rtc:${meetingId}`)
      const attributes = resourceInstance.attributes as { pendingApprovals?: string } || {}

      let pendingApprovals = []
      try {
        if (attributes.pendingApprovals) {
          pendingApprovals = JSON.parse(attributes.pendingApprovals)
        }
      } catch (parseError) {
        console.log("Could not parse pending approvals:", parseError)
      }

      console.log("Found pending approvals:", pendingApprovals)

      return NextResponse.json({
        success: true,
        pendingApprovals,
      })
    } catch (permitError) {
      console.error("Error accessing meeting in Permit.io:", permitError)
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Error getting pending approvals:", error)
    return NextResponse.json({ success: false, error: "Failed to get pending approvals" }, { status: 500 })
  }
}
