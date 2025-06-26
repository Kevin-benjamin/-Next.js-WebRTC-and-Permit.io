import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, meetingId, action, adminUserId } = body // action: 'grant_speaking' or 'revoke_speaking'

    // Verify that the admin has permission to manage participants
    const canMute = await permit.check(adminUserId, "moderate", `web-rtc:${meetingId}`)
    if (!canMute) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    // For speaking permissions, we'll use custom attributes or a separate permission system
    // we'll store this in localStorage
    // but validate the admin's permission to make the change

    return NextResponse.json({
      success: true,
      action,
      message: `Successfully ${action === "grant_speaking" ? "granted" : "revoked"} speaking permission`,
    })
  } catch (error) {
    console.error("Error updating permissions:", error)
    return NextResponse.json({ success: false, error: "Failed to update permissions" }, { status: 500 })
  }
}
