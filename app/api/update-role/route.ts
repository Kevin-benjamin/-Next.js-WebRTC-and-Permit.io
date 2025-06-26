import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, meetingId, newRole, adminUserId } = body
    console.log("body of the request 🔥🔥🔥🔥🔥🔥", body)

    // Verify that the admin has permission to update roles
    const canPromote = await permit.check(adminUserId, "moderate", `web-rtc:${meetingId}`)
    if (!canPromote) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 })
    }

    // Remove existing role assignment for this user in this meeting
    try {
      const existingAssignments = await permit.api.roleAssignments.list({
        user: userId,
        tenant: "default",
        resource_instance: `web-rtc:${meetingId}`,
      })

      console.log("these are the existing assignments for this user 🔥🔥🔥🔥", existingAssignments)

      // Remove all existing role assignments for this resource instance
      for (const assignment of existingAssignments) {
        await permit.api.roleAssignments.unassign({
          user: userId,
          role: assignment.role,
          tenant: "default",
          resource_instance: `web-rtc:${meetingId}`,
        })
      }
    } catch (error) {
      console.log("No existing assignments to remove or error removing:", error)
    }

    // Assign new role
    await permit.api.roleAssignments.assign({
      user: userId,
      role: newRole,
      tenant: "default",
      resource_instance: `web-rtc:${meetingId}`,
    })

    // Get updated user permissions
    const updatedPermissions = await permit.api.roleAssignments.list({
      user: userId,
      tenant: "default",
      resource_instance: `web-rtc:${meetingId}`,
    })

    return NextResponse.json({
      success: true,
      newRole,
      permissions: updatedPermissions,
    })
  } catch (error) {
    console.error("Error updating user role:", error)
    return NextResponse.json({ success: false, error: "Failed to update role" }, { status: 500 })
  }
}
