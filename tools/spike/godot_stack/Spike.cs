using Godot;
using System;

public partial class Spike : Node3D
{
    private CharacterBody3D _body = null!;
    private ENetConnection _server = new();
    private ENetConnection _client = new();
    private ENetPacketPeer? _clientPeer;
    private int _ticks;
    private bool _gotPacket;

    public override void _Ready()
    {
        GD.Print($"[spike] Godot {Engine.GetVersionInfo()["string"]}, .NET {System.Environment.Version}");
        GD.Print($"[spike] physics engine setting: {ProjectSettings.GetSetting("physics/3d/physics_engine")}");
        GD.Print($"[spike] physics tps: {Engine.PhysicsTicksPerSecond}, headless display: {DisplayServer.GetName()}");

        var floor = new StaticBody3D();
        floor.AddChild(new CollisionShape3D { Shape = new BoxShape3D { Size = new Vector3(20, 1, 20) } });
        floor.Position = new Vector3(0, -0.5f, 0);
        AddChild(floor);

        _body = new CharacterBody3D { Position = new Vector3(0, 3, 0) };
        _body.AddChild(new CollisionShape3D { Shape = new CapsuleShape3D { Radius = 0.3f, Height = 1.8f } });
        AddChild(_body);

        var err = _server.CreateHostBound("127.0.0.1", 27777, 8);
        GD.Print($"[spike] ENet server bind: {err}");
        _client.CreateHost(1);
        _clientPeer = _client.ConnectToHost("127.0.0.1", 27777);
    }

    public override void _PhysicsProcess(double delta)
    {
        _ticks++;
        var v = _body.Velocity;
        v.Y -= 9.8f * (float)delta;
        _body.Velocity = v;
        _body.MoveAndSlide();

        Pump(_server, isServer: true);
        Pump(_client, isServer: false);

        if (_ticks == 128)
        {
            GD.Print($"[spike] after 2s of physics: body y={_body.Position.Y:F3}, on_floor={_body.IsOnFloor()}");
            GD.Print($"[spike] ENet loopback packet received: {_gotPacket}");
            GD.Print(_body.IsOnFloor() && _gotPacket ? "[spike] RESULT: PASS" : "[spike] RESULT: FAIL");
            GetTree().Quit(_body.IsOnFloor() && _gotPacket ? 0 : 1);
        }
    }

    private void Pump(ENetConnection host, bool isServer)
    {
        while (true)
        {
            var ev = host.Service();
            var type = (ENetConnection.EventType)(int)ev[0];
            if (type == ENetConnection.EventType.None || type == ENetConnection.EventType.Error) break;
            var peer = (ENetPacketPeer)ev[1];
            if (type == ENetConnection.EventType.Connect && !isServer)
                peer.Send(0, "hello-from-client".ToUtf8Buffer(), (int)ENetPacketPeer.FlagReliable);
            if (type == ENetConnection.EventType.Receive && isServer)
            {
                var msg = peer.GetPacket().GetStringFromUtf8();
                GD.Print($"[spike] server got: {msg}");
                _gotPacket = msg == "hello-from-client";
            }
        }
    }
}
