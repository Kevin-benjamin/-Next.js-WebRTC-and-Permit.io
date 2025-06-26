"use client"

import type { RefObject } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, VideoOff, Crown, Shield, Users } from "lucide-react"

interface Participant {
  id: string
  name: string
  role: "admin" | "co-admin" | "participant"
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isSpeaking: boolean
  joinedAt: string
}

interface VideoGridProps {
  participants: Participant[]
  localStream: MediaStream | null
  localVideoRef: RefObject<HTMLVideoElement>
  isVideoEnabled: boolean
}

export function VideoGrid({ participants, localStream, localVideoRef, isVideoEnabled }: VideoGridProps) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-3 w-3" />
      case "co-admin":
        return <Shield className="h-3 w-3" />
      default:
        return <Users className="h-3 w-3" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-yellow-500"
      case "co-admin":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="h-full">
      {/* Local Video (Self) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
        <Card className="relative bg-gray-800 overflow-hidden">
          <div className="aspect-video relative">
            {isVideoEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover rounded-lg"
                style={{ transform: "scaleX(-1)" }}
                onLoadedMetadata={() => {
                  if (localVideoRef.current) {
                    localVideoRef.current.play().catch(console.error)
                  }
                }}
              />
            ) : (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center rounded-lg">
                <div className="text-center">
                  <VideoOff className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-400">Camera Off</p>
                </div>
              </div>
            )}

            {/* Overlay with name and controls */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Badge className="bg-green-600 text-white text-xs">
                  {getRoleIcon("admin")}
                  <span className="ml-1">You</span>
                </Badge>
              </div>
              <div className="flex items-center space-x-1">
                {localStream?.getAudioTracks()[0]?.enabled ? (
                  <Mic className="h-4 w-4 text-green-400" />
                ) : (
                  <MicOff className="h-4 w-4 text-red-400" />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Other Participants */}
        {participants
          .filter((p) => p.id !== "current-user")
          .map((participant) => (
            <Card key={participant.id} className="relative bg-gray-800 overflow-hidden">
              <div className="aspect-video relative">
                {participant.isVideoEnabled ? (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center rounded-lg">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-xl font-semibold text-white">
                          {participant.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-white">{participant.name}</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center rounded-lg">
                    <div className="text-center">
                      <VideoOff className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-400">Camera Off</p>
                      <p className="text-xs text-gray-500">{participant.name}</p>
                    </div>
                  </div>
                )}

                {/* Overlay with name and controls */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <Badge className={`${getRoleBadgeColor(participant.role)} text-white text-xs`}>
                    {getRoleIcon(participant.role)}
                    <span className="ml-1">{participant.name}</span>
                  </Badge>
                  <div className="flex items-center space-x-1">
                    {participant.isAudioEnabled ? (
                      <Mic className={`h-4 w-4 ${participant.isSpeaking ? "text-green-400" : "text-gray-400"}`} />
                    ) : (
                      <MicOff className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}

        {/* Empty slots for more participants */}
        {Array.from({ length: Math.max(0, 6 - participants.length) }).map((_, index) => (
          <Card key={`empty-${index}`} className="bg-gray-800 border-dashed border-gray-600">
            <div className="aspect-video flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Users className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Waiting for participants...</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
