import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, meetingId } = body

    // Get user's roles for this meeting
    const userRoles = await permit.api.roleAssignments.list({
      user: userId,
      tenant: "default",
      resource_instance: `web-rtc:${meetingId}`,
    })

    // Check specific permissions
    const canMute = await permit.check(userId, "moderate", `web-rtc:${meetingId}`)
    const canPromote = await permit.check(userId, "moderate", `web-rtc:${meetingId}`)
    const canEndMeeting = await permit.check(userId, "moderate", `web-rtc:${meetingId}`)

    return NextResponse.json({
      success: true,
      roles: userRoles,
      permissions: {
        canMute,
        canPromote,
        canEndMeeting,
      },
    })
  } catch (error) {
    console.error("Error getting user permissions:", error)
    return NextResponse.json({ success: false, error: "Failed to get permissions" }, { status: 500 })
  }
}
