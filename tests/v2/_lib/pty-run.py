# tests/v2/_lib/pty-run.py: run one command in a real pty, answer prompts, report the exit code and output.
# argv[1] is JSON: {argv, env, steps: [{expect, send, delay?}], timeout}. Prints JSON {code, out, pending}.
import json, os, pty, select, signal, sys, time

spec = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
    os.execve(spec["argv"][0], spec["argv"], spec["env"])
buf = b""
steps = list(spec["steps"])
deadline = time.time() + spec.get("timeout", 40)
code = None
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.05)
    if r:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            chunk = b""
        if not chunk:
            break
        buf += chunk
    if steps and steps[0]["expect"].encode() in buf:
        step = steps.pop(0)
        time.sleep(step.get("delay", 0.3))
        os.write(fd, step["send"].encode())
        buf += b"\n<<sent>>\n"
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        code = os.waitstatus_to_exitcode(status)
        break
if code is None:
    try:
        while True:
            r, _, _ = select.select([fd], [], [], 0.2)
            if not r:
                break
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            buf += chunk
    except OSError:
        pass
    deadline2 = time.time() + 5
    while time.time() < deadline2:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            code = os.waitstatus_to_exitcode(status)
            break
        time.sleep(0.05)
    if code is None:
        os.kill(pid, signal.SIGKILL)
        _, status = os.waitpid(pid, 0)
        code = -9
print(json.dumps({"code": code, "out": buf.decode("utf8", "replace"), "pending": [s["expect"] for s in steps]}))
